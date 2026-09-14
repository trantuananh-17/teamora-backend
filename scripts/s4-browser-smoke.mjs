import { mkdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import ExcelJS from "exceljs"

const root = path.resolve("..")
const tempDirectory = path.join(root, ".chrome-smoke")
const invalidImportPath = path.join(tempDirectory, "invalid-room-import.xlsx")
const eventId = "demo-s3-event"

await mkdir(tempDirectory, { recursive: true })
const workbook = new ExcelJS.Workbook()
const sheet = workbook.addWorksheet("Phân phòng")
sheet.addRow(["Mã nhân viên", "Khách sạn", "Mã phòng"])
sheet.addRow(["UNKNOWN", "Ocean View Resort", "A101"])
await writeFile(invalidImportPath, Buffer.from(await workbook.xlsx.writeBuffer()))

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
	if (message.error) request.reject(new Error(message.error.message))
	else request.resolve(message.result)
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
	await wait(2_000)
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

try {
	await send("Page.enable")
	await send("Runtime.enable")
	await navigate("http://localhost:3000/login")
	const login = await evaluate(
		`fetch('/api/v1/auth/sign-in/email',{method:'POST',headers:{'content-type':'application/json'},credentials:'include',body:JSON.stringify({email:'btc@teamora.local',password:'Teamora!2026'})}).then(async response=>({status:response.status,body:await response.text()}))`,
	)
	assert(login.status === 200, `Đăng nhập thất bại: ${login.status} ${login.body}`)

	await navigate(`http://localhost:3000/admin/events/${eventId}/vehicles`)
	let text = await evaluate("document.body.innerText")
	assert(
		text.includes("BUS-HN-01") && text.includes("Xuất tổng hợp"),
		"Trang danh sách xe không hiển thị dữ liệu demo/export.",
	)
	const vehicleExport = await evaluate(
		`fetch('/api/v1/events/${eventId}/vehicles/export',{credentials:'include'}).then(response=>({status:response.status,type:response.headers.get('content-type')}))`,
	)
	assert(
		vehicleExport.status === 200 && vehicleExport.type.includes("spreadsheet"),
		"Export xe tổng hợp thất bại.",
	)

	await navigate(`http://localhost:3000/admin/events/${eventId}/vehicles/allocation`)
	text = await evaluate("document.body.innerText")
	if (!text.includes("Đang preview")) {
		const clicked = await evaluate(
			`(()=>{const button=[...document.querySelectorAll('button')].find(item=>item.textContent.includes('Chạy preview')); if(!button)return false; button.click(); return true})()`,
		)
		assert(clicked, `Không tìm thấy nút chạy preview. Nội dung trang: ${text.slice(0, 800)}`)
		await wait(4_000)
		text = await evaluate("document.body.innerText")
	}
	assert(
		text.includes("Đang preview") && text.includes("Preview"),
		`Bảng chưa chiếu chi tiết phương án preview. Nội dung trang: ${text.slice(0, 1_200)}`,
	)
	await evaluate(
		`(()=>{const button=[...document.querySelectorAll('button')].find(item=>item.textContent.includes('Bỏ preview')); if(button)button.click()})()`,
	)
	await wait(1_000)

	await navigate(`http://localhost:3000/admin/events/${eventId}/accommodations`)
	text = await evaluate("document.body.innerText")
	assert(
		text.includes("Ocean View Resort") && text.includes("A101") && text.includes("Nguyễn"),
		"Trang phòng chưa hiển thị khách sạn, phòng hoặc danh sách CBNV.",
	)
	const accommodationExport = await evaluate(
		`fetch('/api/v1/events/${eventId}/accommodations/export',{credentials:'include'}).then(response=>({status:response.status,type:response.headers.get('content-type')}))`,
	)
	assert(
		accommodationExport.status === 200 && accommodationExport.type.includes("spreadsheet"),
		"Export phòng tổng hợp thất bại.",
	)
	const document = await send("DOM.getDocument", { depth: -1 })
	const input = await send("DOM.querySelector", {
		nodeId: document.root.nodeId,
		selector: "input[type=file]",
	})
	assert(input.nodeId, "Không tìm thấy input import phòng.")
	await send("DOM.setFileInputFiles", { nodeId: input.nodeId, files: [invalidImportPath] })
	await wait(2_000)
	text = await evaluate("document.body.innerText")
	assert(
		text.includes("File phân phòng có lỗi") && text.includes("Dòng 2"),
		"UI chưa hiển thị lỗi import theo dòng.",
	)

	console.log(
		JSON.stringify(
			{
				login: "ok",
				vehicles: "ok",
				vehiclePreview: "ok",
				vehicleExport: "ok",
				accommodations: "ok",
				roomOccupants: "ok",
				importErrors: "ok",
				accommodationExport: "ok",
			},
			null,
			2,
		),
	)
} finally {
	socket.close()
	await rm(invalidImportPath, { force: true })
}
