import { mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { createClient } from "@libsql/client"
import type { Client } from "@libsql/client"
import { sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/libsql"
import type { LibSQLDatabase } from "drizzle-orm/libsql"

import { env } from "../config/env"
import * as schema from "./schema"

export type Database = LibSQLDatabase<typeof schema>
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0]

/**
 * Anything that reads or writes. Repositories accept this so the same method
 * works inside and outside a transaction — the service decides which.
 */
export type DbExecutor = Database | Transaction

let client: Client | undefined
let database: Database | undefined

function getClient(): Client {
	if (client) return client

	const path = resolve(env.databasePath)
	mkdirSync(dirname(path), { recursive: true })
	// DATABASE_PATH is a filesystem path in the deploy contract; libsql wants a
	// URL. pathToFileURL is what gets a Windows path across correctly.
	client = createClient({ url: pathToFileURL(path).href })
	return client
}

async function initialize(instance: Database) {
	// WAL lets the outbox interval write while a request reads; without it the
	// two block each other inside the single process (ADR-008).
	await instance.run(sql`pragma journal_mode = WAL`)
	// A writer holding the lock during an Excel import must not fail a concurrent
	// request instantly with SQLITE_BUSY.
	await instance.run(sql`pragma busy_timeout = 5000`)
	// Off by default in SQLite. Every `eventId` reference depends on it.
	await instance.run(sql`pragma foreign_keys = ON`)
}

let ready: Promise<void> | undefined

function getDatabase(): Database {
	if (!database) {
		database = drizzle(getClient(), { schema })
		// Fire once, on the same connection every later statement uses. Awaited by
		// `openDatabase()` where the caller can wait; a query that races it still
		// runs correctly, only without the pragmas for its first moments.
		ready = initialize(database)
	}
	return database
}

/**
 * Opens the connection and applies the pragmas. Entrypoints call this so the
 * settings are in force before the first request, rather than racing it.
 */
export async function openDatabase(): Promise<void> {
	getDatabase()
	await ready
}

/**
 * Lazily opened: importing this module must not touch the filesystem, so the
 * migration runner and unit tests can import repositories without creating a
 * database file as a side effect.
 */
export const db = new Proxy({} as Database, {
	get(_target, prop, receiver) {
		return Reflect.get(getDatabase() as object, prop, receiver)
	},
})

export async function checkDatabaseConnection(): Promise<boolean> {
	try {
		await getDatabase().get(sql`select 1`)
		return true
	} catch {
		return false
	}
}

export function closeDatabase(): void {
	client?.close()
	client = undefined
	database = undefined
	ready = undefined
}
