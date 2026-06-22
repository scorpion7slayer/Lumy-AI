import { describe, expect, it } from "vitest"
import { databaseDateToISOString, resolveDatabaseConfig } from "@/lib/db.server"

describe("resolveDatabaseConfig", () => {
  it("utilise les paramètres MySQL séparés", () => {
    expect(
      resolveDatabaseConfig({
        DB_HOST: "db.internal",
        DB_PORT: "3307",
        DB_NAME: "lumy",
        DB_USER: "lumy-user",
        DB_PASSWORD: "test-password",
      })
    ).toEqual({
      host: "db.internal",
      port: 3307,
      database: "lumy",
      user: "lumy-user",
      password: "test-password",
    })
  })

  it("donne la priorité aux paramètres séparés sur DATABASE_URL", () => {
    expect(
      resolveDatabaseConfig({
        DB_HOST: "db.internal",
        DB_NAME: "lumy",
        DB_USER: "lumy-user",
        DB_PASSWORD: "",
        DATABASE_URL: "mysql://legacy:secret@legacy.internal/legacy",
      })
    ).toMatchObject({
      host: "db.internal",
      port: 3306,
      database: "lumy",
      user: "lumy-user",
      password: "",
    })
  })

  it("accepte encore DATABASE_URL comme solution de repli", () => {
    expect(
      resolveDatabaseConfig({
        DATABASE_URL: "mysql://lumy-user:test-password@db.internal:3308/lumy",
      })
    ).toEqual({
      host: "db.internal",
      port: 3308,
      database: "lumy",
      user: "lumy-user",
      password: "test-password",
    })
  })

  it("refuse un port invalide", () => {
    expect(() =>
      resolveDatabaseConfig({
        DB_HOST: "db.internal",
        DB_PORT: "not-a-port",
        DB_NAME: "lumy",
        DB_USER: "lumy-user",
      })
    ).toThrow("DB_PORT doit être un numéro de port valide.")
  })
})

describe("databaseDateToISOString", () => {
  it("réinterprète une heure MySQL de Bruxelles avec l’heure d’été", () => {
    expect(
      databaseDateToISOString(
        new Date("2026-06-22T20:15:00.000Z"),
        "Europe/Brussels"
      )
    ).toBe("2026-06-22T18:15:00.000Z")
  })

  it("utilise automatiquement l’heure d’hiver", () => {
    expect(
      databaseDateToISOString(
        new Date("2026-01-22T20:15:00.000Z"),
        "Europe/Brussels"
      )
    ).toBe("2026-01-22T19:15:00.000Z")
  })
})
