const eventId = "demo-s3-event"
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
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
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
async function clickTab(label) {
	const point = await evaluate(
		`(()=>{const item=[...document.querySelectorAll('[role=tab]')].find(node=>node.textContent.includes(${JSON.stringify(label)})); if(!item)return null; const rect=item.getBoundingClientRect(); return {x:rect.left+rect.width/2,y:rect.top+rect.height/2}})()`,
	)
	if (!point) return false
	await send("Input.dispatchMouseEvent", {
		type: "mousePressed",
		x: point.x,
		y: point.y,
		button: "left",
		clickCount: 1,
	})
	await send("Input.dispatchMouseEvent", {
		type: "mouseReleased",
		x: point.x,
		y: point.y,
		button: "left",
		clickCount: 1,
	})
	return true
}
function assert(condition, message) {
	if (!condition) throw new Error(message)
}
async function login(email) {
	return evaluate(
		`fetch('/api/v1/auth/sign-in/email',{method:'POST',headers:{'content-type':'application/json'},credentials:'include',body:JSON.stringify({email:${JSON.stringify(email)},password:'Teamora!2026'})}).then(async response=>({status:response.status,body:await response.text()}))`,
	)
}

try {
	await send("Page.enable")
	await send("Runtime.enable")
	await navigate("http://localhost:3000/login")
	let result = await login("demo01@teamora.local")
	assert(result.status === 200, `Đăng nhập CBNV thất bại: ${result.status}`)
	const hiddenJourney = await evaluate(
		`fetch('/api/v1/me/journey?eventId=${eventId}',{credentials:'include'}).then(response=>response.status)`,
	)
	assert(hiddenJourney === 409, `Journey trước công bố phải trả 409, thực tế ${hiddenJourney}`)
	await evaluate("fetch('/api/v1/auth/sign-out',{method:'POST',credentials:'include'})")

	result = await login("btc@teamora.local")
	assert(result.status === 200, `Đăng nhập BTC thất bại: ${result.status}`)
	await navigate(`http://localhost:3000/admin/events/${eventId}/content`)
	let text = await evaluate("document.body.innerText")
	assert(
		text.includes("Lịch trình & nội dung") &&
			text.includes("Nhận phòng và ăn trưa") &&
			text.includes("Thông báo (2)"),
		`Màn quản lý nội dung không hiển thị dữ liệu S5: ${text.slice(0, 1500)}`,
	)
	const clickedTab = await clickTab("Thông báo")
	assert(clickedTab, "Không tìm thấy tab thông báo.")
	await wait(1_000)
	text = await evaluate("document.body.innerText")
	const tabState = await evaluate(
		`JSON.stringify([...document.querySelectorAll('[role=tab]')].map(item=>({text:item.textContent,active:item.getAttribute('data-active'),selected:item.getAttribute('aria-selected')})))`,
	)
	assert(
		text.includes("Lưu ý hành lý"),
		`Tab thông báo không hiển thị nội dung đã seed (${tabState}): ${text.slice(0, 1200)}`,
	)
	await navigate(`http://localhost:3000/admin/events/${eventId}`)
	text = await evaluate("document.body.innerText")
	assert(
		text.includes("Tổng CBNV") &&
			text.includes("Nhu cầu xe theo chặng") &&
			text.includes("Chuyến bay"),
		"Dashboard S5 chưa hiển thị đủ nhóm số liệu.",
	)
	const publish = await evaluate(
		`fetch('/api/v1/events/${eventId}/status/advance',{method:'POST',headers:{'content-type':'application/json'},credentials:'include',body:JSON.stringify({status:'information_published'})}).then(async response=>({status:response.status,body:await response.text()}))`,
	)
	assert(publish.status === 200, `Công bố kỳ thất bại: ${publish.status} ${publish.body}`)
	const changed = await evaluate(
		`fetch('/api/v1/events/${eventId}/schedule/demo-schedule-01',{method:'PATCH',headers:{'content-type':'application/json'},credentials:'include',body:JSON.stringify({description:'Nhận vòng tay, chìa khóa phòng và dùng bữa tại nhà hàng chính.'})}).then(response=>response.status)`,
	)
	assert(changed === 200, `Cập nhật lịch sau công bố thất bại: ${changed}`)
	const notifications = await evaluate(
		`fetch('/api/v1/events/${eventId}/notifications?limit=100',{credentials:'include'}).then(response=>response.json())`,
	)
	assert(
		notifications.items.some((item) => item.template === "information_published"),
		"Chưa tạo email công bố.",
	)
	assert(
		notifications.items.some(
			(item) => item.template === "assignment_changed" && item.payload.changeType === "schedule",
		),
		"Chưa tạo email thay đổi lịch trình.",
	)
	await evaluate("fetch('/api/v1/auth/sign-out',{method:'POST',credentials:'include'})")

	result = await login("demo01@teamora.local")
	assert(result.status === 200, `Đăng nhập lại CBNV thất bại: ${result.status}`)
	await navigate("http://localhost:3000/")
	text = await evaluate("document.body.innerText")
	for (const expected of [
		"Hành trình của Nguyễn Minh Anh",
		"Chuyến bay",
		"Xe đưa đón",
		"Ocean View Resort",
		"Nhận phòng và ăn trưa",
		"Lưu ý hành lý",
	])
		assert(
			text.includes(expected),
			`Journey thiếu nội dung: ${expected}. DOM: ${text.slice(0, 1800)}`,
		)
	console.log(
		JSON.stringify(
			{
				hiddenBeforePublish: "ok",
				adminContent: "ok",
				dashboard: "ok",
				publish: "ok",
				publicationEmail: "ok",
				changeEmail: "ok",
				employeeJourney: "ok",
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
