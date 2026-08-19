// dsh-remote-gateway — 浏览器 client-plugin（./client）
// 设置页「远程网关」段：待批准设备审批 + 已信任设备管理，
// 直连 dsh 同源路由 /_dsh/remote-gateway，样式对齐 dsh-net-proxy（--dsw-alias-* 变量）。
window.__ModuleLoader__.load({
	id: "dsh-remote-gateway",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;

		var React = require("react");
		var react_jsx_runtime = require("react/jsx-runtime");
		var jsx = react_jsx_runtime.jsx;
		var Prm = require("@deepseek-ai/dsh-client-ui-primitives");
		var Button = Prm.Button;

		var css =
			[".rgw-root{}",
			".rgw-info{display:flex;flex-direction:column;gap:4px;font-size:12.5px;color:var(--dsw-alias-label-secondary)}",
			".rgw-info b{color:var(--dsw-alias-label-primary);font-weight:600}",
			".rgw-empty{margin:0;font-size:12.5px;color:var(--dsw-alias-label-tertiary)}",
			".rgw-list{display:flex;flex-direction:column;gap:8px}",
			".rgw-item{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2,#2a2f3a);border-radius:10px;background:var(--dsw-alias-bg-layer-1,#12151b)}",
			".rgw-item-main{display:flex;flex-direction:column;gap:2px;min-width:0}",
			".rgw-item-main b{font-size:13px;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			".rgw-item-meta{font-size:11.5px;color:var(--dsw-alias-label-tertiary)}",
			".rgw-item-actions{display:flex;gap:8px;flex:none}",
			".rgw-table{width:100%;border-collapse:collapse;font-size:12.5px}",
			".rgw-table th{text-align:left;font-size:11px;font-weight:600;letter-spacing:.04em;color:var(--dsw-alias-label-tertiary);padding:4px 8px;border-bottom:1px solid var(--dsw-alias-border-l2,#2a2f3a)}",
			".rgw-table td{padding:7px 8px;border-bottom:1px solid rgba(42,47,58,.5);color:var(--dsw-alias-label-primary)}",
			".rgw-meta{color:var(--dsw-alias-label-tertiary);white-space:nowrap}",
			".rgw-controls{display:flex;align-items:center;gap:10px;margin:0 0 10px;flex-wrap:wrap}",
			".rgw-toggle{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:var(--dsw-alias-label-secondary);cursor:pointer;user-select:none}",
			".rgw-toggle input{margin:0}"].join("");

		var NS = "remote-gateway";
		var zh = {
			kicker: "DSH 插件",
			nav: "远程网关",
			subtitle: "remote-gateway 的设备接入审批与白名单管理：网关随 DSH 启停、崩溃自动重启。新设备连接时在这里批准，已信任设备可随时吊销。数据自动刷新。",
			status: "网关状态",
			statusOn: "运行中",
			statusOff: "未运行",
			local: "本机入口",
			tunnel: "公网隧道",
			upstream: "上游",
			notRunningHint: "网关未运行。点「启动网关」由 dsh 托管拉起（崩溃自动重启，dsh 退出时自动停止）；也可以在本机手动运行 start.js。",
			pendingTitle: "待批准设备",
			noPending: "没有待批准设备。新设备打开网关地址后会自动出现在这里。",
			unknownDevice: "未知设备",
			waited: "已等待",
			approve: "批准",
			reject: "拒绝",
			devicesTitle: "已信任设备",
			noDevices: "白名单为空。批准待批设备后，设备会出现在这里。",
			colNote: "备注",
			colToken: "令牌",
			colAdded: "批准时间",
			colLastSeen: "最近活跃",
			neverSeen: "从未",
			revoke: "吊销",
			actionFailed: "操作失败：无法连接网关，请确认网关正在运行",
			startBtn: "启动网关",
			stopBtn: "停止",
			autoStart: "随 DSH 一起启动",
			statusManaged: "运行中 · dsh 托管",
			statusExternal: "运行中 · 外部",
			statusPending: "启动中",
			restartLabel: "自动重启",
			lastExitLabel: "上次退出",
			lifecycleOff: "生命周期管理不可用（控制器初始化失败）。请手动启动网关：node scripts/start.js"
		};
		var en = {
			kicker: "DSH plugin",
			nav: "Remote Gateway",
			subtitle: "Approve device access and manage the trusted-device whitelist. The gateway starts/stops with DSH and auto-restarts on crash. Data refreshes automatically.",
			status: "Gateway status",
			statusOn: "Running",
			statusOff: "Not running",
			local: "Local entry",
			tunnel: "Public tunnel",
			upstream: "Upstream",
			notRunningHint: "Gateway is not running. Click \"Start gateway\" to let dsh own it (auto-restart on crash, stops when dsh exits); or run start.js manually.",
			pendingTitle: "Pending devices",
			noPending: "No pending devices. New devices that open the gateway URL will appear here.",
			unknownDevice: "Unknown device",
			waited: "waiting",
			approve: "Approve",
			reject: "Reject",
			devicesTitle: "Trusted devices",
			noDevices: "Whitelist is empty. Approved devices will appear here.",
			colNote: "Note",
			colToken: "Token",
			colAdded: "Approved at",
			colLastSeen: "Last seen",
			neverSeen: "never",
			revoke: "Revoke",
			actionFailed: "Action failed: cannot reach the gateway - make sure it is running",
			startBtn: "Start gateway",
			stopBtn: "Stop",
			autoStart: "Start with DSH",
			statusManaged: "Running · managed by dsh",
			statusExternal: "Running · external",
			statusPending: "Starting",
			restartLabel: "auto-restarts",
			lastExitLabel: "last exit",
			lifecycleOff: "Lifecycle control unavailable (controller init failed). Start the gateway manually: node scripts/start.js"
		};

		var API = "/_dsh/remote-gateway";

		function pad(n) {
			return n < 10 ? "0" + n : "" + n;
		}

		function fmtTime(ts) {
			var d = new Date(ts);
			return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
		}

		function RemoteGatewaySection(props) {
			var t = props.t;
			var [state, setState] = React.useState({ running: false, localUrl: "", adminUrl: "", upstream: null, tunnel: null, control: null, lifecycleDisabled: false, lifecyclePending: false, pending: [], devices: [] });
			var [busy, setBusy] = React.useState("");
			var [error, setError] = React.useState("");

			function refresh() {
				fetch(API, { cache: "no-store" })
					.then(function (r) { return r.json(); })
					.then(function (j) {
						if (!j || !j.ok) return;
						var g = j.gateway || {};
						var c = j.control || null;
						setState({
							running: Boolean(j.running),
							localUrl: g.localUrl || "",
							adminUrl: g.adminUrl || "",
							upstream: g.upstream || null,
							tunnel: g.tunnel || null,
							control: c,
							lifecycleDisabled: Boolean(c && c.lifecycle === "disabled"),
							lifecyclePending: Boolean(c && (c.spawning || c.restartPending)),
							pending: j.pending || [],
							devices: j.devices || []
						});
						setError("");
					})
					.catch(function () {});
			}

			React.useEffect(function () {
				refresh();
				var timer = setInterval(refresh, state.lifecyclePending ? 1500 : 5000);
				return function () { clearInterval(timer); };
			}, [state.lifecyclePending]);

			function act(action, extra) {
				var key = action + ":" + (extra.id || extra.token || "");
				setBusy(key);
				setError("");
				fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({ action: action }, extra)) })
					.then(function (r) { return r.json(); })
					.then(function (j) {
						if (!j || !j.ok) {
							if (j && j.error && j.error !== "gateway-unreachable") setError(j.error);
							else setError(t("actionFailed"));
						} else {
							refresh();
						}
					})
					.catch(function () { setError(t("actionFailed")); })
					.then(function () { setBusy(""); });
			}

			var ctrl = state.control || {};
			var badge = state.running
				? (ctrl.managed ? [t("statusManaged"), "ok"] : [t("statusExternal"), "ok"])
				: (state.lifecyclePending ? [t("statusPending"), "warn"] : [t("statusOff"), "warn"]);

			return jsx("div", { className: "rgw-root", children: [
				jsx("header", { className: "npx-header", children: [
					jsx("div", { className: "npx-kicker", children: t("kicker") }),
					jsx("h2", { className: "npx-title", children: t("nav") }),
					jsx("p", { className: "npx-intro", children: t("subtitle") })
				] }),
				jsx("section", { className: "npx-panel", children: [
					jsx("div", { className: "npx-panel-head", children: [
						jsx("h3", { children: t("status") }),
						jsx("span", { className: "npx-badge " + badge[1], children: badge[0] })
				] }),
					state.lifecycleDisabled
						? jsx("div", { className: "npx-alert err", children: t("lifecycleOff") })
						: jsx("div", { className: "rgw-controls", children: [
								jsx(Button, { variant: "primary", disabled: busy !== "" || state.running || state.lifecyclePending, onClick: function () { act("start", {}); }, children: t("startBtn") }),
								jsx(Button, { variant: "outline", disabled: busy !== "" || !state.running || !ctrl.managed || state.lifecyclePending, onClick: function () { act("stop", {}); }, children: t("stopBtn") }),
								jsx("label", { className: "rgw-toggle", children: [
									jsx("input", { type: "checkbox", checked: Boolean(ctrl.autoStart), disabled: busy !== "", onChange: function (e) { act("setAutoStart", { enabled: e.target.checked }); } }),
									jsx("span", { children: t("autoStart") })
								]
								})
						] }),
					state.running
						? jsx("div", { className: "rgw-info", children: [
								jsx("div", { children: [jsx("span", { children: t("local") }), "  ", jsx("b", { children: state.localUrl })] }),
								state.tunnel ? jsx("div", { children: [jsx("span", { children: t("tunnel") }), "  ", jsx("b", { children: state.tunnel })] }) : null,
								state.upstream ? jsx("div", { children: [jsx("span", { children: t("upstream") }), "  ", jsx("b", { children: state.upstream })] }) : null,
								(ctrl.restartCount || 0) > 0 ? jsx("div", { className: "rgw-meta", children: t("restartLabel") + " × " + ctrl.restartCount }) : null
							]
						})
						: jsx("div", { className: "npx-alert err", children: [
								t("notRunningHint"),
								ctrl.lastExit && !state.lifecyclePending
									? jsx("div", { className: "rgw-item-meta", children: t("lastExitLabel") + ": " + (ctrl.lastExit.error || "code=" + ctrl.lastExit.code) })
									: null
							]
						})
				] }),
				jsx("section", { className: "npx-panel", children: [
					jsx("div", { className: "npx-panel-head", children: [
						jsx("h3", { children: t("pendingTitle") }),
						state.pending.length ? jsx("span", { className: "npx-badge warn", children: String(state.pending.length) }) : null
					] }),
					error ? jsx("div", { className: "npx-alert err", children: error }) : null,
					state.pending.length === 0
						? jsx("p", { className: "rgw-empty", children: t("noPending") })
						: jsx("div", { className: "rgw-list", children: state.pending.map(function (p) {
							return jsx("div", { key: p.id, className: "rgw-item", children: [
								jsx("div", { className: "rgw-item-main", children: [
									jsx("b", { children: p.note || t("unknownDevice") }),
									jsx("span", { className: "rgw-item-meta", children: t("waited") + " " + Math.max(0, Math.round((Date.now() - (p.createdAt || Date.now())) / 1000)) + "s" })
								] }),
								jsx("div", { className: "rgw-item-actions", children: [
									jsx(Button, { variant: "primary", disabled: busy !== "", onClick: function () { act("approve", { id: p.id }); }, children: t("approve") }),
									jsx(Button, { variant: "outline", disabled: busy !== "", onClick: function () { act("reject", { id: p.id }); }, children: t("reject") })
								] })
							] });
						}) })
				] }),
				jsx("section", { className: "npx-panel", children: [
					jsx("div", { className: "npx-panel-head", children: [
						jsx("h3", { children: t("devicesTitle") }),
						state.devices.length ? jsx("span", { className: "npx-badge ok", children: String(state.devices.length) }) : null
					] }),
					state.devices.length === 0
						? jsx("p", { className: "rgw-empty", children: t("noDevices") })
						: jsx("table", { className: "rgw-table", children: [
							jsx("tr", { children: [
								jsx("th", { children: t("colNote") }),
								jsx("th", { children: t("colToken") }),
								jsx("th", { children: t("colAdded") }),
								jsx("th", { children: t("colLastSeen") }),
								jsx("th", { children: "" })
							] }),
							jsx(React.Fragment, { key: "rows", children: state.devices.map(function (d) {
								return jsx("tr", { key: d.token, children: [
									jsx("td", { children: d.note || "—" }),
									jsx("td", { className: "rgw-meta", children: String(d.token || "").slice(0, 8) + "…" }),
									jsx("td", { className: "rgw-meta", children: d.addedAt ? fmtTime(d.addedAt) : "—" }),
									jsx("td", { className: "rgw-meta", children: d.lastSeen ? fmtTime(d.lastSeen) : t("neverSeen") }),
									jsx("td", { children: jsx(Button, { variant: "outline", disabled: busy !== "", onClick: function () { act("revoke", { token: d.token }); }, children: t("revoke") }) })
								] });
							}) })
						] })
				] })
			] });
		}

		var inject = ["slots", "locale"];

		function apply(ctx) {
			if (typeof document !== "undefined") {
				try {
					var tagId = "dsh-remote-gateway/styles.css";
					if (!document.getElementById(tagId)) {
						var st = document.createElement("style");
						st.id = tagId;
						st.setAttribute("data-plugin-css", "");
						st.textContent = css;
						(document.head || document.documentElement).appendChild(st);
					}
				} catch (e) {}
			}
			var t = ctx.locale.bind(NS);
			ctx.effect(function () { return ctx.locale.register(NS, { zh: zh, en: en }); }, "dsh-remote-gateway: section dictionaries");
			ctx.slots.inject("settings.section", function () {
				return ctx.slots.register({
					name: "settings.section",
					id: "remote-gateway",
					order: 45,
					label: function () { return t("nav"); },
					locale: NS,
					inject: function () { return { t: t }; }
				}, RemoteGatewaySection);
			});
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
