import { createFileRoute } from "@tanstack/react-router"
import { assertSameOrigin, requireAdmin } from "@/lib/auth.server"
import {
  countAdmins,
  deleteFeedbackForAdmin,
  deleteFileForAdmin,
  deleteFilesForConversation,
  deleteSessionForAdmin,
  deleteUserAccount,
  listAdminUsers,
  listFeedbackForAdmin,
  listFilesForAdmin,
  listIncidentsForAdmin,
  listModelControls,
  listModelIncidentStats,
  listSessionsForAdmin,
  readChatState,
  resolveIncident,
  reviewEarlyAccess,
  setAdminUserDisabled,
  setAdminUserRole,
  setModelControl,
  updateFeedbackStatus,
  writeChatState,
} from "@/lib/db.server"
import { sendEarlyAccessDecisionEmail } from "@/lib/email.server"
import { getModelCatalog } from "@/lib/model-catalog.server"
import { isExternalProviderId, providerLabels } from "@/lib/providers"

export const Route = createFileRoute("/api/admin")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const admin = await requireAdmin(request)
        const requestedUserId = new URL(request.url).searchParams
          .get("userId")
          ?.trim()
        const databaseUsers = await listAdminUsers()
        const users = databaseUsers.map(
          ({ internalRole: _internalRole, ...user }) =>
            admin.capabilities.superAdminAccess
              ? user
              : {
                  ...user,
                  fileCount: 0,
                  feedbackCount: 0,
                  sessionCount: 0,
                }
        )
        if (!admin.capabilities.superAdminAccess) {
          return Response.json({
            viewerCapabilities: admin.capabilities,
            users,
            feedback: [],
            incidents: [],
            modelManagement: [],
            selected: null,
          })
        }
        const [feedback, incidents, catalog, controls, modelStats] =
          await Promise.all([
            listFeedbackForAdmin(),
            listIncidentsForAdmin(),
            getModelCatalog(),
            listModelControls(),
            listModelIncidentStats(),
          ])
        const providerControl = new Map(
          controls
            .filter((control) => control.modelId === null)
            .map((control) => [control.provider, control.enabled])
        )
        const modelControl = new Map(
          controls
            .filter((control) => control.modelId !== null)
            .map((control) => [
              `${control.provider}:${control.modelId}`,
              control.enabled,
            ])
        )
        const incidentCount = new Map(
          modelStats.map((item) => [
            `${item.provider}:${item.model}`,
            item.occurrenceCount,
          ])
        )
        const modelManagement = catalog.configuredProviders.map((provider) => {
          const models = catalog.models
            .filter(
              (model) =>
                isExternalProviderId(model.provider) &&
                model.provider === provider
            )
            .map((model) => ({
              provider,
              providerLabel: providerLabels[provider],
              id: model.id,
              name: model.name,
              enabled:
                providerControl.get(provider) !== false &&
                modelControl.get(`${provider}:${model.id}`) !== false,
              incidentCount: incidentCount.get(`${provider}:${model.id}`) ?? 0,
            }))
          return {
            id: provider,
            label: providerLabels[provider],
            enabled: providerControl.get(provider) !== false,
            incidentCount: models.reduce(
              (total, model) => total + model.incidentCount,
              0
            ),
            models,
          }
        })
        const userId = requestedUserId || users.at(0)?.id || ""
        const [selectedState, files, sessions] = userId
          ? await Promise.all([
              readChatState(userId),
              listFilesForAdmin(userId),
              listSessionsForAdmin(userId),
            ])
          : [null, [], []]
        return Response.json({
          viewerCapabilities: admin.capabilities,
          users,
          feedback,
          incidents,
          modelManagement,
          selected: userId
            ? { userId, state: selectedState?.state ?? null, files, sessions }
            : null,
        })
      },
      PATCH: async ({ request }) => {
        assertSameOrigin(request)
        const admin = await requireAdmin(request)
        const body = (await request.json().catch(() => ({}))) as Record<
          string,
          unknown
        >
        const action = typeof body.action === "string" ? body.action : ""
        const userId = typeof body.userId === "string" ? body.userId : ""

        if (action === "early_access") {
          const status =
            body.status === "approved" || body.status === "rejected"
              ? body.status
              : null
          if (!status) {
            return Response.json(
              { error: "Décision d’accès invalide." },
              { status: 400 }
            )
          }
          const target = (await listAdminUsers()).find(
            (user) => user.id === userId
          )
          if (!target) {
            return Response.json(
              { error: "Utilisateur introuvable." },
              { status: 404 }
            )
          }
          if (target.internalRole !== "user") {
            return Response.json(
              {
                error:
                  "L’accès anticipé ne s’applique pas aux administrateurs.",
              },
              { status: 400 }
            )
          }
          const updated = await reviewEarlyAccess(userId, status, admin.id)
          if (!updated) {
            return Response.json(
              { error: "La demande n’a pas pu être mise à jour." },
              { status: 409 }
            )
          }
          try {
            await sendEarlyAccessDecisionEmail({
              userId,
              recipient: target.email,
              name: target.name,
              status,
            })
          } catch (error) {
            console.error("[Lumy] Notification de décision impossible", error)
          }
          return Response.json({ updated: true })
        }

        if (action === "resolve_incident") {
          if (!admin.capabilities.superAdminAccess) {
            return Response.json(
              { error: "Accès super administrateur requis." },
              { status: 403 }
            )
          }
          const incidentId =
            typeof body.incidentId === "string" ? body.incidentId.trim() : ""
          const updated = await resolveIncident(incidentId, admin.id)
          return updated
            ? Response.json({ updated: true })
            : Response.json({ error: "Incident introuvable." }, { status: 404 })
        }

        if (action === "model_control") {
          if (!admin.capabilities.superAdminAccess) {
            return Response.json(
              { error: "Accès super administrateur requis." },
              { status: 403 }
            )
          }
          const provider =
            typeof body.provider === "string" ? body.provider.trim() : ""
          const modelId =
            typeof body.modelId === "string" ? body.modelId.trim() : null
          if (!isExternalProviderId(provider)) {
            return Response.json(
              { error: "Fournisseur invalide." },
              { status: 400 }
            )
          }
          await setModelControl({
            provider,
            modelId,
            enabled: body.enabled === true,
            updatedByUserId: admin.id,
          })
          return Response.json({ updated: true })
        }

        if (action === "set_role") {
          const role = body.role === "admin" ? "admin" : "user"
          if (userId === admin.id && role !== "admin") {
            return Response.json(
              { error: "Vous ne pouvez pas retirer votre propre rôle admin." },
              { status: 400 }
            )
          }
          const target = (await listAdminUsers()).find(
            (user) => user.id === userId
          )
          if (!target)
            return Response.json(
              { error: "Utilisateur introuvable." },
              { status: 404 }
            )
          if (target.internalRole === "super_admin") {
            return Response.json(
              {
                error: "Le rôle du propriétaire ne peut pas être modifié ici.",
              },
              { status: 400 }
            )
          }
          if (!admin.capabilities.superAdminAccess) {
            if (target.internalRole !== "user" || role !== "admin") {
              return Response.json(
                {
                  error:
                    "Un administrateur peut promouvoir un utilisateur, mais ne peut pas modifier un autre administrateur.",
                },
                { status: 403 }
              )
            }
          }
          if (
            target.internalRole === "admin" &&
            role === "user" &&
            (await countAdmins()) <= 1
          ) {
            return Response.json(
              {
                error: "Le dernier administrateur ne peut pas être rétrogradé.",
              },
              { status: 400 }
            )
          }
          await setAdminUserRole(userId, role)
          return Response.json({ updated: true })
        }

        if (action === "set_disabled") {
          if (userId === admin.id) {
            return Response.json(
              { error: "Vous ne pouvez pas désactiver votre propre compte." },
              { status: 400 }
            )
          }
          const target = (await listAdminUsers()).find(
            (user) => user.id === userId
          )
          if (!target) {
            return Response.json(
              { error: "Utilisateur introuvable." },
              { status: 404 }
            )
          }
          if (
            !admin.capabilities.superAdminAccess &&
            target.internalRole !== "user"
          ) {
            return Response.json(
              { error: "Vous ne pouvez pas désactiver un administrateur." },
              { status: 403 }
            )
          }
          if (target.internalRole === "super_admin") {
            return Response.json(
              { error: "Le compte propriétaire ne peut pas être désactivé." },
              { status: 403 }
            )
          }
          await setAdminUserDisabled(userId, body.disabled === true)
          return Response.json({ updated: true })
        }

        if (action === "delete_conversation" || action === "delete_memory") {
          if (!admin.capabilities.superAdminAccess) {
            return Response.json(
              { error: "Accès super administrateur requis." },
              { status: 403 }
            )
          }
          const resourceId =
            typeof body.resourceId === "string" ? body.resourceId : ""
          const stored = await readChatState(userId)
          if (!stored)
            return Response.json(
              { error: "Données introuvables." },
              { status: 404 }
            )
          const state = stored.state
          if (action === "delete_conversation") {
            state.conversations = state.conversations.filter(
              (conversation) => conversation.id !== resourceId
            )
            state.files = state.files.filter(
              (file) => file.conversationId !== resourceId
            )
            if (state.activeConversationId === resourceId) {
              state.activeConversationId = state.conversations.at(0)?.id ?? null
            }
            await deleteFilesForConversation(userId, resourceId)
          } else {
            state.memories = state.memories.filter(
              (memory) => memory.id !== resourceId
            )
          }
          await writeChatState(userId, state)
          return Response.json({ updated: true })
        }

        if (action === "feedback_status") {
          if (!admin.capabilities.superAdminAccess) {
            return Response.json(
              { error: "Accès super administrateur requis." },
              { status: 403 }
            )
          }
          const feedbackId =
            typeof body.feedbackId === "string" ? body.feedbackId : ""
          const status = ["new", "reviewed", "resolved"].includes(
            String(body.status)
          )
            ? (body.status as "new" | "reviewed" | "resolved")
            : "reviewed"
          const updated = await updateFeedbackStatus(feedbackId, status)
          return updated
            ? Response.json({ updated: true })
            : Response.json({ error: "Feedback introuvable." }, { status: 404 })
        }

        return Response.json(
          { error: "Action admin invalide." },
          { status: 400 }
        )
      },
      DELETE: async ({ request }) => {
        assertSameOrigin(request)
        const admin = await requireAdmin(request)
        const params = new URL(request.url).searchParams
        const type = params.get("type")
        const id = params.get("id")?.trim() ?? ""
        if (!id)
          return Response.json(
            { error: "Identifiant requis." },
            { status: 400 }
          )

        if (type === "user") {
          if (id === admin.id) {
            return Response.json(
              { error: "Utilisez vos paramètres pour supprimer votre compte." },
              { status: 400 }
            )
          }
          const target = (await listAdminUsers()).find((user) => user.id === id)
          if (!target) {
            return Response.json(
              { error: "Utilisateur introuvable." },
              { status: 404 }
            )
          }
          if (target.internalRole === "super_admin") {
            return Response.json(
              { error: "Le compte propriétaire ne peut pas être supprimé." },
              { status: 403 }
            )
          }
          if (
            !admin.capabilities.superAdminAccess &&
            target.internalRole !== "user"
          ) {
            return Response.json(
              { error: "Vous ne pouvez pas supprimer un administrateur." },
              { status: 403 }
            )
          }
          await deleteUserAccount(id)
          return new Response(null, { status: 204 })
        }
        if (!admin.capabilities.superAdminAccess) {
          return Response.json(
            { error: "Accès super administrateur requis." },
            { status: 403 }
          )
        }
        if (type === "file") {
          const deleted = await deleteFileForAdmin(id)
          return deleted
            ? new Response(null, { status: 204 })
            : Response.json({ error: "Fichier introuvable." }, { status: 404 })
        }
        if (type === "feedback") {
          const deleted = await deleteFeedbackForAdmin(id)
          return deleted
            ? new Response(null, { status: 204 })
            : Response.json({ error: "Feedback introuvable." }, { status: 404 })
        }
        if (type === "session") {
          const deleted = await deleteSessionForAdmin(id)
          return deleted
            ? new Response(null, { status: 204 })
            : Response.json({ error: "Session introuvable." }, { status: 404 })
        }
        return Response.json(
          { error: "Type de ressource invalide." },
          { status: 400 }
        )
      },
    },
  },
})
