import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

const eventId = "demo-s3-event"
const screenshotDirectory = path.resolve("../.chrome-smoke-s6/screenshots")
await mkdir(screenshotDirectory, { recursive: true })
const targets = await (await fetch("http://127.0.0.1:9222/json")).json()
const target = targets.find((item) => item.type === "page")
if (!target) throw new Error("Chrome headless không có page target.")

const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
	socket.addEventListener("open", resolve, { once: true })
	socket.addEventListener("error", reject, { once: true })
})

let commandId = 0
const pending = new Map()
socket.addEventListener("message", (event) => {
	const message = JSON.parse(event.data)
	if (!message.id) return
	const request = pending.get(message.id)
	if (!request) return
	pending.delete(message.id)
	message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result)
})

function send(method, params = {}) {
	const id = ++commandId
	return new Promise((resolve, reject) => {
		pending.set(id, { resolve, reject })
		socket.send(JSON.stringify({ id, method, params }))
	})
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function navigate(url) {
	await send("Page.navigate", { url })
	await wait(1_000)
}

async function evaluate(expression) {
	const result = await send("Runtime.evaluate", {
		expression,
		awaitPromise: true,
		returnByValue: true,
	})
	if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
	return result.result.value
}

function assert(condition, message) {
	if (!condition) throw new Error(message)
}

async function login(email) {
	return evaluate(
		`fetch('/api/v1/auth/sign-in/email',{method:'POST',headers:{'content-type':'application/json'},credentials:'include',body:JSON.stringify({email:${JSON.stringify(email)},password:'Teamora!2026'})}).then(async response=>({status:response.status,body:await response.text()}))`,
	)
}

async function setViewport(width, height, mobile = false) {
	await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile })
}

async function assertNoHorizontalPageOverflow(screen) {
	const metrics = await evaluate(`(() => {
		const main = document.querySelector('main')
		return {
			viewport: window.innerWidth,
			page: document.documentElement.scrollWidth,
			body: document.body.scrollWidth,
			mainClient: main?.clientWidth ?? 0,
			mainScroll: main?.scrollWidth ?? 0,
			mainOffset: main?.scrollLeft ?? 0,
		}
	})()`)
	assert(
		metrics.page <= metrics.viewport + 1 &&
			metrics.body <= metrics.viewport + 1 &&
			metrics.mainScroll <= metrics.mainClient + 1 &&
			metrics.mainOffset === 0,
		`${screen} bị cuộn ngang: ${JSON.stringify(metrics)}`,
	)
}

async function screenshot(name) {
	const result = await send("Page.captureScreenshot", { format: "png", fromSurface: true })
	await writeFile(path.join(screenshotDirectory, `${name}.png`), Buffer.from(result.data, "base64"))
}

try {
	await send("Page.enable")
	await send("Runtime.enable")
	await setViewport(1440, 900)
	await navigate("http://localhost:3000/login")

	let result = await login("btc@teamora.local")
	assert(result.status === 200, `Đăng nhập BTC thất bại: ${result.status} ${result.body}`)

	await navigate(`http://localhost:3000/admin/events/${eventId}/audit-log`)
	let text = await evaluate("document.body.innerText")
	assert(
		text.includes("Nhật ký thay đổi") &&
			text.includes("Người thao tác") &&
			text.includes("Thay đổi"),
		`Màn Audit Log không hiển thị đúng: ${text.slice(0, 1_200)}`,
	)
	assert(
		text.includes("Xuất Excel") &&
			text.includes("Tất cả đối tượng") &&
			text.includes("Tất cả hành động"),
		"Audit Log thiếu export hoặc bộ lọc.",
	)
	await assertNoHorizontalPageOverflow("Audit Log desktop")

	const auditFiltered = await evaluate(
		`fetch('/api/v1/events/${eventId}/audit-logs?action=export&limit=10',{credentials:'include'}).then(async response=>({status:response.status,body:await response.json()}))`,
	)
	assert(
		auditFiltered.status === 200 &&
			auditFiltered.body.items.every((item) => item.action === "export"),
		"Bộ lọc Audit API không đúng.",
	)

	const exports = await evaluate(`Promise.all([
		fetch('/api/v1/events/${eventId}/audit-logs/export',{credentials:'include'}),
		fetch('/api/v1/events/${eventId}/export',{credentials:'include'}),
		fetch('/api/v1/employees/export',{credentials:'include'})
	]).then(async responses=>Promise.all(responses.map(async response=>({status:response.status,type:response.headers.get('content-type'),bytes:(await response.arrayBuffer()).byteLength}))))`)
	assert(
		exports.every(
			(item) => item.status === 200 && item.type.includes("spreadsheet") && item.bytes > 5_000,
		),
		`Export S6 thất bại: ${JSON.stringify(exports)}`,
	)

	const adminRoutes = [
		["Danh sách kỳ", "/admin"],
		["CBNV", "/admin/employees"],
		["Nơi làm việc", "/admin/work-locations"],
		["Tổng quan kỳ", `/admin/events/${eventId}`],
		["Đăng ký", `/admin/events/${eventId}/registrations`],
		["Chuyến bay", `/admin/events/${eventId}/flights`],
		["Phân chuyến", `/admin/events/${eventId}/flights/allocation`],
		["Xe", `/admin/events/${eventId}/vehicles`],
		["Phân xe", `/admin/events/${eventId}/vehicles/allocation`],
		["Phòng", `/admin/events/${eventId}/accommodations`],
		["Nội dung", `/admin/events/${eventId}/content`],
		["Email", `/admin/events/${eventId}/notifications`],
		["Team", `/admin/events/${eventId}/teams`],
		["Điểm đón", `/admin/events/${eventId}/pickup-points`],
		["Audit Log", `/admin/events/${eventId}/audit-log`],
	]
	const viewports = [
		["desktop", 1440, 900, false],
		["tablet", 768, 1024, false],
		["mobile", 390, 844, true],
	]
	for (const [viewportName, width, height, mobile] of viewports) {
		await setViewport(width, height, mobile)
		for (const [name, route] of adminRoutes) {
			await navigate(`http://localhost:3000${route}`)
			await assertNoHorizontalPageOverflow(`${name} ${viewportName}`)
		}
	}
	text = await evaluate("document.body.innerText")
	assert(
		text.includes("Nhật ký thay đổi") && text.includes("Người thao tác"),
		"Audit Log mobile không render nội dung chính.",
	)
	await screenshot("audit-mobile")

	await navigate(`http://localhost:3000/admin/events/${eventId}`)
	text = await evaluate("document.body.innerText")
	assert(
		text.includes("Tổng quan kỳ") && text.includes("Xuất toàn bộ dữ liệu"),
		"Tổng quan kỳ mobile thiếu export.",
	)
	await assertNoHorizontalPageOverflow("Dashboard admin mobile")
	await screenshot("dashboard-mobile")

	await evaluate(
		"fetch('/api/v1/auth/sign-out',{method:'POST',headers:{'content-type':'application/json'},credentials:'include',body:'{}'})",
	)
	result = await login("demo01@teamora.local")
	assert(result.status === 200, `Đăng nhập CBNV thất bại: ${result.status}`)
	const forbiddenAdminResponses = await evaluate(`Promise.all([
		fetch('/api/v1/events/${eventId}/audit-logs',{credentials:'include'}),
		fetch('/api/v1/events/${eventId}/export',{credentials:'include'}),
		fetch('/api/v1/employees/export',{credentials:'include'})
	]).then(responses=>responses.map(response=>response.status))`)
	assert(
		forbiddenAdminResponses.every((status) => status === 403),
		`CBNV truy cập được API quản trị S6: ${JSON.stringify(forbiddenAdminResponses)}`,
	)
	await navigate("http://localhost:3000/")
	text = await evaluate("document.body.innerText")
	assert(
		text.includes("Hành trình của Nguyễn Minh Anh") &&
			text.includes("Chuyến bay") &&
			text.includes("Xe đưa đón"),
		"My Journey mobile thiếu dữ liệu chính.",
	)
	await assertNoHorizontalPageOverflow("My Journey mobile")
	await screenshot("journey-mobile")

	console.log(
		JSON.stringify(
			{
				auditScreen: "ok",
				auditFilters: "ok",
				auditExport: "ok",
				eventWorkbook: "ok",
				masterWorkbook: "ok",
				auditResponsive: "ok",
				adminResponsive: "ok",
				journeyResponsive: "ok",
				employeeAdminDenied: "ok",
				responsiveRoutes: adminRoutes.length,
				responsiveViewports: viewports.length,
			},
			null,
			2,
		),
	)
} finally {
	try {
		await send("Browser.close")
	} catch {
		/* Browser may already be closing. */
	}
	socket.close()
}
