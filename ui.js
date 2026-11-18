// ui.js — v6 界面：计划书 v3 第一期
// 三段式资源条（名称｜数量/上限｜产量 + 进度条 + 预计充满/耗尽）、
// 建筑卡「激活/总数 · 效率%」+ ＋/− 切激活、资源↔建筑联动高亮、人口「用量/容量」警示
(function () {
    const E = window.EM, C = window.C;
    let tab = "build";
    let world = "w1";
    let hlRes = null;   // 联动高亮：当前悬浮的资源 id

    const TABS = [
        { id: "build", name: "建筑" },
        { id: "tech", name: "科技" },
        { id: "front", name: "疆域" },
        { id: "story", name: "回廊记事" },
        { id: "rebirth", name: "换门" },
        { id: "archive", name: "档案" },
        { id: "options", name: "选项" },
    ];

    const $ = (s) => document.querySelector(s);
    const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const signed = (n) => (n >= 0 ? "+" : "") + E.fmt(n);
    const NB = C.B.length, NT = Object.keys(C.T).length;

    // ---------- 顶栏 ----------
    function renderStatus() {
        const s = E.state, R = E.rates();
        const era = C.ERAS.find(x => x.n === E.currentEra());
        $("#status").innerHTML =
            "已建 <b>" + E.builtCount() + "/" + NB + "</b> · 已研究 <b>" + E.researchedCount() + "/" + NT + "</b>" +
            " · 第 " + era.n + " 纪 " + era.name +
            " · 信标 <b>×" + E.fmt(R.emberMult) + "</b>（战力+" + Math.round(E.emberMilBonus() * 100) + "%）" +
            " · 存续 " + E.fmtDur((Date.now() - s.run.start) / 1000);
        // 荣光进度条：拯救这个世界的进度（累计灯油 / 换门阈值）
        const g = E.gloryInfo();
        const pct = Math.min(100, g.ratio * 100);
        $("#glory").innerHTML =
            '<div class="glory-label"><span>人类的荣光 · 拯救此世界</span><span>' +
            (pct >= 100 ? "已可换门" : pct.toFixed(1) + "%") + "</span></div>" +
            '<div class="glory-track"><div class="glory-fill" style="width:' + Math.min(100, pct) + '%"></div></div>';
    }

    function renderWorldTabs() {
        const s = E.state;
        let h = "";
        // 只显示已推开的门——回廊铁律：一次只能推开一扇；下一扇门通关后才会出现
        for (const w of C.WORLDS) {
            if (!s.unlockedWorlds.includes(w.id)) continue;
            const cls = ["wtab", world === w.id ? "on" : "open"].join(" ");
            h += '<button class="' + cls + '" data-wtab="' + w.id + '">' + esc(w.short) + "</button>";
        }
        $("#world-tabs").innerHTML = h;
    }

    function renderTabs() {
        let h = "";
        for (const t of TABS) {
            h += '<div class="tab ' + (tab === t.id ? "on" : "") + '" data-tab="' + t.id + '">' + t.name + "</div>";
        }
        $("#tabs").innerHTML = h;
    }

    // ---------- 左栏：人口 + 三段式资源条 ----------
    function renderLeft() {
        const s = E.state, R = E.rates();
        const idle = Math.max(0, s.run.pop - E.staffed());
        // 营地标题随人口更名
        const head = document.querySelector("#left .col-head");
        if (head) head.textContent = E.campName();
        // 人口块：用量/容量 警示
        const full = s.run.pop > 0 && idle < 1;
        let h = '<div class="pop-block"><div class="pop-line"><span>生还者</span><span class="pop-val">' +
            Math.floor(s.run.pop) + "</span></div>";
        const warn = full ? " warn" : "";
        let pp = '人口 <span class="pop-use' + warn + '">' + E.staffed() + " / " + E.fmt(R.cap) + "</span> · 空闲 " + Math.floor(idle);
        if (s.run.pop === 0) pp = "灰地里一直有活人——盖起住房，他们才有地方活";
        else if (full) pp += "（没人手可派，停用一处设施腾人）";
        h += '<div class="pop-sub">' + pp + "</div>";
        // 灯油覆盖（锚定后出现）
        if (s.run.pop > 0 && R.popDem) {
            if (R.popDem.heat > 0)
                h += '<div class="pop-sub">灯油 <span class="pop-use' + (R.warm < 1 ? " warn" : "") + '">覆盖 ' + Math.round(R.warm * 100) + "%</span>" +
                    (R.warm < 1 ? '（缺灯，人变灰迟钝、产能打折）' : "") + "</div>";
        }
        h += "</div>";

        h += '<div class="resource-bar">';
        for (const r of C.RES) {
            if (!s.seenRes[r.id]) continue;
            const rate = R.inc[r.id] - R.cons[r.id];
            const neg = rate < -1e-9;
            const cap = R.store[r.id] || 0;
            const cur = s.run.res[r.id];
            const pct = cap > 0 ? Math.min(100, (cur / cap) * 100) : 0;
            const bar = cap > 0 ? ' style="background:linear-gradient(90deg, rgba(43,108,176,.16) ' + pct.toFixed(1) + '%, transparent ' + pct.toFixed(1) + '%)"' : "";
            const valTxt = E.fmt(cur) + (cap > 0 ? '<small class="res-cap">/' + E.fmt(cap) + "</small>" : "");
            h += '<div class="res-row' + (neg ? " neg" : "") + '" data-tip="res:' + r.id + '"' + bar + ">" +
                '<span class="res-name">' + r.name +
                '</span><span class="res-val">' + valTxt +
                '</span><span class="res-rate">' + (rate !== 0 ? signed(rate) : "") + "</span></div>";
        }
        h += '<div class="res-row" data-tip="res:ember"><span class="res-name">信标</span>' +
            '<span class="res-val">' + E.fmt(s.ember) + '</span><span class="res-rate">×' + E.fmt(R.emberMult) + "</span></div>";
        h += "</div>";
        $("#resource-box").innerHTML = h;
    }

    // ---------- 中栏：建筑 ----------
    // 造不了的原因（null=可建）：材料不足 / 空闲人手不足
    function buildBlock(b, lv) {
        const cost = E.costOf(b, lv);
        for (const k in cost) {
            if (E.state.run.res[k] < cost[k]) {
                return "缺" + C.RES_NAME[k] + " " + E.fmt(cost[k] - E.state.run.res[k]);
            }
        }
        if (b.jobs && E.idlePop() < b.jobs) {
            return "空闲人手不足，还差 " + Math.ceil(b.jobs - Math.max(0, E.idlePop())) + " 人";
        }
        return null;
    }

    // 分组标题旁的局域资源胶囊
    function chip(txt, warn) {
        return '<span class="chip' + (warn ? " chip-warn" : "") + '">' + esc(txt) + "</span>";
    }

    // ---------- 悬浮提示 ----------
    function bldTip(id) {
        const b = C.BM[id], s = E.state, R = E.rates();
        const lv = s.run.fac[b.id] || 0, a = R.act[id] || 0;
        const built = lv > 0;
        let h = esc(b.desc) + "<hr>";
        const cost = E.costOf(b, lv);
        for (const k in cost) {
            const have = s.run.res[k], need = cost[k];
            const ok = have >= need;
            const pct = ok && have > 0 && need > 0 ? " (" + ((need / have) * 100).toFixed(0) + "%)" : "";
            h += '<span class="' + (ok ? "" : "tip-bad") + '">' + C.RES_NAME[k] + " " + E.fmt(need) + pct + "</span><br>";
        }
        if (b.disc) {
            let d = 1;
            for (const t of b.disc) if (E.techDone(t)) d *= 0.85;
            if (d < 1) h += '<span class="tip-good">科技折减 ×' + d.toFixed(2) + "</span><br>";
        }
        if (b.jobs) h += '<span class="' + (E.idlePop() >= b.jobs ? "" : "tip-bad") + '">派 ' + b.jobs + " 人/座</span><br>";
        h += "<hr>";
        const suf = built ? "" : "/座";
        if (b.prod) for (const k in b.prod) {
            const actual = a > 0 ? b.prod[k] * a * E.tierMult(lv) * R.mult * (R.eff[id] || 1) : 0;
            h += C.RES_NAME[k] + ": +" + E.fmt(built ? actual : b.prod[k]) + "/秒" + suf + "<br>";
        }
        const useTxt = (amt) => E.fmt(amt * (a > 0 ? a * (R.eff[id] || 1) : 1)) + "/秒" + suf;
        if (b.recipe) for (const k in b.recipe) h += C.RES_NAME[k] + ": -" + useTxt(b.recipe[k]) + "<br>";
        if (b.supply) for (const k in b.supply) h += "耗" + C.RES_NAME[k] + ": -" + useTxt(b.supply[k]) + "<br>";
        if (b.cap) h += "人口容量: +" + E.fmt(b.cap * (built ? lv : 1)) + (built ? "" : "/座") + "<br>";
        if (b.milCap) h += "军队容量: +" + E.fmt(b.milCap * (built ? lv : 1)) + (built ? "" : "/座") + "<br>";
        if (b.effMil) h += "全军战力: +" + Math.round(b.effMil * (built ? lv : 1) * 100) + "%<br>";
        if (b.timeCut) h += "出征耗时: -" + Math.round(b.timeCut * (built ? lv : 1) * 100) + "%<br>";
        if (b.eff) h += "全局产量: +" + Math.round(b.eff * (built ? lv : 1) * 100) + "%<br>";
        if (b.eg) h += "信标获取: +" + Math.round(b.eg * (built ? lv : 1) * 100) + "%<br>";
        if (b.store) {
            const parts = Object.keys(b.store).map(k => k === "*" ? "全部物资" : C.RES_NAME[k]);
            h += "储量上限: +" + E.fmt(Object.values(b.store)[0] * (built ? lv : 1)) + "（" + parts.join("、") + "）<br>";
        }
        if (built) {
            if (a < lv) h += '<span class="tip-dim">停用 ' + (lv - a) + " 座</span><br>";
            if (a > 0 && (b.prod || b.recipe || b.supply)) {
                const pct = Math.round((R.eff[id] || 0) * 100);
                h += "当前效率 " + pct + "%" + (pct < 100 ? "（投入短缺）" : "") + "<br>";
            }
        }
        const block = buildBlock(b, lv);
        if (block) h += '<hr><span class="tip-bad">' + esc(block) + "</span>";
        return h;
    }

    function resTip(id) {
        if (id === "ember") return "<b>信标</b><hr>换门重开的传承，也是唯一能带过门的东西。累计灯油越多换门所得越多；每局阈值 20000×1.5^次数——第一扇门要用「天」来算。<br>" +
            "产量加成递增：第 1-3 个每个 +8%、第 4-6 个每个 +10%、第 7 个起每个 +12%；另每个信标全军战力 +10%。";
        const s = E.state, R = E.rates();
        const cap = R.store[id] || 0, cur = s.run.res[id], net = R.inc[id] - R.cons[id];
        let h = "<b>" + C.RES_NAME[id] + "</b><hr>";
        if (cap > 0) h += "储量 " + E.fmt(cur) + " / 上限 " + E.fmt(cap) + "<br>";
        else h += "储量 " + E.fmt(cur) + "（不设上限）<br>";
        if (cap > 0 && net > 0 && cur < cap) h += "预计充满：" + E.fmtDur((cap - cur) / net) + "<br>";
        if (net < 0 && cur > 0) h += '<span class="tip-bad">预计耗尽：' + E.fmtDur(cur / -net) + "</span><br>";
        h += "<hr>";
        let any = false;
        for (const b of C.B) {
            const a = R.act[b.id] || 0;
            if (!a || !R.active[b.id]) continue;
            const e = R.eff[b.id] || 0;
            if (b.prod && b.prod[id]) { h += b.name + ": +" + E.fmt(b.prod[id] * a * e * R.mult * E.tierMult(s.run.fac[b.id] || 0)) + "/秒<br>"; any = true; }
            if (b.recipe && b.recipe[id]) { h += b.name + ": -" + E.fmt(b.recipe[id] * a * e) + "/秒<br>"; any = true; }
            if (b.supply && b.supply[id]) { h += b.name + ": -" + E.fmt(b.supply[id] * a * e) + "/秒<br>"; any = true; }
        }
        if (R.popDem) {
            if (id === "heat" && R.popDem.heat > 0) { h += "居民用灯油: -" + E.fmt(R.popDem.heat) + "/秒<br>"; any = true; }
                    }
        if (!any) h += "暂无来源与消耗";
        return h;
    }

    function techTip(id) {
        const t = C.T[id];
        let h = esc(t.desc);
        if (t.boost) {
            const parts = Object.keys(t.boost).map(k => C.RES_NAME[k] + "产出 +" + Math.round(t.boost[k] * 100) + "%（永久）");
            h += "<hr><span class='tip-good'>" + parts.join("、") + "</span>";
        }
        const unlockB = C.B.filter(b => b.tech === id).map(b => b.name);
        const unlockA = C.ARMY.filter(a => a.tech === id).map(a => a.name);
        const unl = unlockB.concat(unlockA);
        if (unl.length) h += "<hr><span class='tip-good'>解锁：" + unl.join("、") + "</span>";
        if (t.req && !(E.state.run.fac[t.req] > 0)) h += "<hr><span class='tip-bad'>需先建成：" + (C.BM[t.req] ? C.BM[t.req].name : t.req) + "</span>";
        if (t.pre && !E.techDone(t.pre)) h += "<br><span class='tip-bad'>需先研究：" + C.T[t.pre].name + "</span>";
        return h;
    }

    function renderBuild() {
        const s = E.state, R = E.rates();

        let h = "<div class='pane'>";
        // 布局顺序：大厅(基地)在最上，其次住房，再采集/加工，仓储、研究、能源、军事、功能殿后
        const TYPE_ORDER = ["基地", "住房", "采集", "农业", "加工", "信念", "仓储", "军事", "功能"];
        const bs = C.B.filter(b => E.unlocked(b));
        const groups = [];
        for (const b of bs) {
            let g = groups.find(x => x.type === b.type);
            if (!g) { g = { type: b.type, list: [] }; groups.push(g); }
            g.list.push(b);
        }
        groups.sort((x, y) => {
            const ix = TYPE_ORDER.indexOf(x.type), iy = TYPE_ORDER.indexOf(y.type);
            return (ix < 0 ? 99 : ix) - (iy < 0 ? 99 : iy);
        });
        if (!groups.length) {
            h += '<div class="note">还没有建筑。先去科技页研究点什么。</div></div>';
            return h;
        }
        for (const g of groups) {
            h += '<h4 class="cat-head">' + esc(g.type) + '</h4><div class="building-grid">';
            for (const b of g.list) {
                const lv = s.run.fac[b.id] || 0;
                const a = R.act[b.id] || 0;
                const block = buildBlock(b, lv);
                const e = R.eff[b.id] || 0;
                let eff = "";
                if (lv > 0 && a === 0) eff = '<span class="beff stop">已停用</span>';
                else if (lv > 0 && a > 0 && (b.prod || b.recipe || b.supply) && e < 0.995)
                    eff = '<span class="beff' + (e < 0.6 ? " stop" : "") + '">效率: ' + Math.round(e * 100) + "%</span>";
                const cnt = lv > 0 ? a + "/" + lv + " 座" : "未建成";
                h += '<div class="bcard' + (block ? " dim" : "") + '" data-act="buy" data-id="' + b.id + '" data-tip="bld:' + b.id + '">' +
                    '<div class="bcard-info"><strong class="' + (block ? "insufficient" : "") + '">' + esc(b.name) + "</strong>" +
                    "<small>" + cnt + "</small>" + eff + "</div>" +
                    '<div class="btn-group">' +
                    '<button class="sq" data-act="max" data-id="' + b.id + '" title="一键买最大">⇥</button>' +
                    (a < lv ? '<button class="sq" data-act="up" data-id="' + b.id + '" title="激活一座">＋</button>' : "") +
                    (a > 0 ? '<button class="sq" data-act="down" data-id="' + b.id + '" title="停用一座（腾出人手）">−</button>' : "") +
                    (lv > 0 && !b.core ? '<button class="sq" data-act="sell" data-id="' + b.id + '" title="拆除一座（返还一半造价）">✕</button>' : "") +
                    "</div></div>";
            }
            h += "</div>";
        }
        h += "</div>";
        return h;
    }

    // ---------- 中栏：科技 ----------
    function techPriceTxt(t) {
        const parts = Object.keys(t.price).map(k => C.RES_NAME[k] + " " + E.fmt(t.price[k]));
        return parts.join(" · ");
    }

    function techCards(ids, doneMode) {
        const s = E.state;
        let h = "";
        if (!ids.length) h += '<div class="note" style="grid-column:1/-1">' + (doneMode ? "什么都没留下。" : "暂无可研究的方向。") + "</div>";
        for (const id of ids) {
            const t = C.T[id];
            if (doneMode) {
                h += '<div class="tcard researched" data-tip="tech:' + id + '"><b>' + esc(t.name) + "</b><span class='cost'>✓ 已研究</span></div>";
            } else {
                const ok = Object.keys(t.price).every(k => s.run.res[k] >= t.price[k]);
                h += '<button class="tcard' + (ok ? "" : " no") + '" data-act="tech" data-id="' + id + '" data-tip="tech:' + id + '">' +
                    "<b>" + esc(t.name) + "</b><span class='cost'>" + techPriceTxt(t) + "</span></button>";
            }
        }
        return h;
    }

    function renderTech() {
        const s = E.state;
        const can = E.researchable();
        const done = Object.keys(C.T).filter(id => E.techDone(id));
        const byKind = (arr, k) => arr.filter(id => (C.T[id].kind || "unlock") === k);
        const KINDS = [
            { k: "boost", name: "效率改良", sub: "研究后对应产出永久提升——更高效率再生产" },
            { k: "unlock", name: "解锁方向", sub: "新建筑、新资源链与新技术" },
            { k: "mil", name: "军事线", sub: "兵种、军备与据点扩张" },
        ];
        let h = "<div class='pane'>";
        for (const kd of KINDS) {
            const canK = byKind(can, kd.k), doneK = byKind(done, kd.k);
            h += '<h4 class="cat-head">可研究 · ' + kd.name + ' <span class="cat-sub">' + kd.sub + "</span></h4><div class=\"tech-grid\">" +
                techCards(canK, false) + "</div>";
            h += '<h4 class="cat-head">已研究 · ' + kd.name + ' <span class="cat-sub">' + doneK.length + " 项</span></h4><div class='tech-grid'>" +
                techCards(doneK, true) + "</div>";
        }
        h += "</div>";
        return h;
    }

    // ---------- 中栏：疆域（军队 + 据点 + 挂机派单出征） ----------
    let selNode = null;
    let expTroops = {};
    const lootTxt = (n) => Object.keys(n.loot || {}).map(k => C.RES_NAME[k] + "×" + E.fmt(n.loot[k])).join("、") || "无";
    function nodeGainTxt(n) {
        const g = n.gain || {}, parts = [];
        if (g.pct) for (const k in g.pct) parts.push(C.RES_NAME[k] + " +" + Math.round(g.pct[k] * 100) + "%");
        if (g.flat) for (const k in g.flat) parts.push(C.RES_NAME[k] + " +" + E.fmt(g.flat[k]) + "/秒");
        if (g.global) parts.push("全局产出 +" + Math.round(g.global * 100) + "%");
        return parts.join("、") || "无";
    }
    function renderDeploy(node) {
        const s = E.state;
        const home = s.run.mil.army;
        let h = '<div class="group-head">出征 · ' + esc(node.name) +
            ' <button class="sq" data-act="nsel-x" title="取消">✕</button></div>';
        let any = false;
        for (const a of C.ARMY) {
            const have = home[a.id] || 0;
            if (!E.techDone(a.tech) || have <= 0) continue;
            any = true;
            const cur = expTroops[a.id] || 0;
            h += '<div class="mil-row"><b>' + esc(a.name) + '</b><span class="mil-info">在家 ' + have + " · 战力 " + a.pow + '</span>' +
                '<span class="btn-group">' +
                '<button class="sq" data-act="tp" data-id="' + a.id + '" data-n="-10">−10</button>' +
                '<button class="sq" data-act="tp" data-id="' + a.id + '" data-n="-1">−1</button>' +
                '<span class="mil-cur">' + cur + "</span>" +
                '<button class="sq" data-act="tp" data-id="' + a.id + '" data-n="1">＋1</button>' +
                '<button class="sq" data-act="tp" data-id="' + a.id + '" data-n="10">＋10</button>' +
                "</span></div>";
        }
        if (!any) h += '<div class="note">家里没有可派的兵，先编制军队。</div>';
        const myPow = E.troopsPow(expTroops);
        const win = myPow >= node.garrison;
        let lossTxt = "";
        if (win) {
            let lr = 0.25 * (node.garrison / myPow);
            if (E.techDone("drill")) lr *= 0.8;
            lossTxt = " · 预计战损 " + Math.round(lr * 100) + "%";
        }
        // 队伍星级构成（按兵种在家比例估算，新老搭配随队）
        const vetParts = [];
        for (const a of C.ARMY) {
            if (!(expTroops[a.id] > 0)) continue;
            const vt = E.vetSummary(a.id);
            if (vt.total && vt.star > 0) vetParts.push(a.name + "★" + vt.star + "×" + vt.stars[vt.star]);
        }
        if (vetParts.length) h += '<div class="note">队伍含老兵：' + vetParts.join("、") + "（老兵随队压阵，战损先扣新兵）</div>";
        h += '<div class="dep-pow' + (win ? "" : " bad") + '">我方战力 <b>' + E.fmt(myPow) + "</b> vs 守军 <b>" + E.fmt(node.garrison) + "</b>" +
            (win ? lossTxt : " · 战力不足，禁止出征") + "</div>";
        if (win && any)
            h += '<button class="wide" data-act="go"><b>出发</b><span class="txt">耗时 ' + E.fmtDur(E.expDur(node.id)) +
                " · 缴获 " + lootTxt(node) + " · 收复后 " + nodeGainTxt(node) + "</span></button>";
        return h;
    }
    function renderFront() {
        const s = E.state;
        const exp = s.run.exp;
        let h = "<div class='pane'>";
        h += '<div class="group-head">军队 <span class="cat-sub">兵力 ' + E.milTotal() + " / " + E.milCap() +
            " · 战力加成 ×" + E.fmt(E.milMult()) + "</span></div>";
        if (!E.milCap()) {
            h += '<div class="note">还没有营房——研究「侦察」并建起营房，就能把空闲居民编成军队。</div>';
        } else {
            for (const a of C.ARMY) {
                if (!E.techDone(a.tech)) continue;
                const home = s.run.mil.army[a.id] || 0;
                const vt = E.vetSummary(a.id);
                const costTxt = Object.keys(a.cost).map(k => C.RES_NAME[k] + " " + E.fmt(a.cost[k])).join("·");
                let vetTxt = "";
                if (home) {
                    const stars = vt.stars;
                    vetTxt = " · <span class='vet-tag'>★" + vt.star + " 战力+" + Math.round(E.VET_POW[vt.star] * 100) + "%";
                    if (vt.nextNeed) vetTxt += " · " + vt.top + "/" + vt.nextNeed + " 次存活";
                    vetTxt += "</span>";
                }
                h += '<div class="mil-row"><b>' + esc(a.name) + '</b><span class="mil-info">战力 ' + a.pow +
                    " · 编制 " + costTxt + " · 在家 " + home + vetTxt + "</span>" +
                    '<span class="btn-group"><button class="sq" data-act="rec" data-id="' + a.id + '" data-n="1">＋1</button>' +
                    '<button class="sq" data-act="rec" data-id="' + a.id + '" data-n="10">＋10</button></span></div>';
            }
        }
        h += '<div class="note">兵从空闲生还者转职：占人手、要用灯。被动老兵制——存活出征 1/3/6 次自动升一/二/三星（战力 +15/30/50%、自身战损 -10/20/30%）；战损先扣新兵、同级内先扣低级兵。</div>';
        if (exp) {
            const node = C.NM[exp.node];
            const remain = Math.max(0, exp.dur - (Date.now() - exp.start) / 1000);
            h += '<div class="exp-banner">⚔ 「' + esc(node.name) + "」进军中——战力 " + E.fmt(exp.pow) +
                " vs 守军 " + E.fmt(node.garrison) + "，剩 " + E.fmtDur(remain) + "</div>";
        }
        h += '<div class="group-head">据点 <span class="cat-sub">三区推进 · 收复给永久收益 · 换门清空</span></div>';
        let visAny = false, lastZone = 0;
        for (let i = 0; i < C.NODES.length; i++) {
            const n = C.NODES[i];
            if (!(i === 0 || s.run.node[C.NODES[i - 1].id])) continue;
            visAny = true;
            if (n.zone !== lastZone) {
                lastZone = n.zone;
                const zoneOwned = C.NODES.filter(x => x.zone === n.zone && s.run.node[x.id]).length;
                const zoneAll = C.NODES.filter(x => x.zone === n.zone).length;
                h += '<div class="cat-head" style="margin-top:6px">☠ ' + (C.NODE_ZONES[n.zone - 1] || "未知区域") +
                    ' <span class="cat-sub">' + zoneOwned + "/" + zoneAll + " 已收复</span></div>";
            }
            const owned = s.run.node[n.id];
            let state, btn;
            if (owned) {
                state = '<span class="tip-good">✓ 已收复 · ' + nodeGainTxt(n) + "</span>";
                btn = "";
            } else if (exp) {
                state = '<span class="tip-dim">队伍在外</span>';
                btn = "";
            } else {
                state = "守军 " + E.fmt(n.garrison) + "（" + esc(n.foe) + "）· " + E.fmtDur(E.expDur(n.id)) + " · 缴获 " + lootTxt(n);
                const ok = E.troopsPow(s.run.mil.army) >= n.garrison;
                btn = '<button class="wide" data-act="nsel" data-id="' + n.id + '"' + (ok ? "" : " disabled") + ">出征</button>";
            }
            h += '<div class="node-card' + (owned ? " owned" : "") + (selNode === n.id ? " sel" : "") + '">' +
                '<div class="node-info"><b>' + esc(n.name) + "</b><small>" + state + "</small></div>" + btn + "</div>";
        }
        if (!visAny) h += '<div class="note">研究「侦察」后，灰城边缘会出现第一个据点。</div>';
        if (selNode && !exp) h += renderDeploy(C.NM[selNode]);
        h += "</div>";
        return h;
    }

    // ---------- 中栏：其他世界（占位） ----------
    function renderWorldPlaceholder(wid) {
        const s = E.state;
        const w = C.WORLDS.find(x => x.id === wid);
        const ph = C.PLACEHOLDER[wid];
        if (!ph) return '<div class="pane note">' + esc(w.name) + "：尚未进入视野。</div>";
        if (!s.unlockedWorlds.includes(wid)) {
            return '<div class="pane"><div class="group-head">' + esc(w.name) + "</div>" +
                '<div class="note">' + esc(ph.unlock) + "。</div></div>";
        }
        let h = '<div class="pane"><div class="group-head">' + esc(w.name) + " · 迁徙规划预览</div>";
        h += '<div class="note">此世界的建设系统将在后续版本开放。以下为已勘察到的设施：</div>';
        ph.eras.forEach((era, i) => {
            h += '<h4 class="cat-head">' + esc(era) + "</h4><div class='building-grid'>";
            for (const name of ph.b[i]) {
                h += '<div class="bcard locked"><div class="bcard-info"><strong>' + esc(name) + "</strong></div></div>";
            }
            h += "</div>";
        });
        h += "</div>";
        return h;
    }

    // ---------- 中栏：换门 ----------
    function renderRebirth() {
        const s = E.state, R = E.rates();
        const gain = E.rebirthGain();
        let h = '<div class="pane"><div class="group-head">本局结算</div><table style="width:100%">';
        h += "<tr><td>本扇门</td><td>腐土 · 第一扇门</td></tr>";
        h += "<tr><td>本局时长</td><td>" + E.fmtDur((Date.now() - s.run.start) / 1000) + "</td></tr>";
        h += "<tr><td>累计灯油</td><td>" + E.fmt(s.run.heatTotal) + "</td></tr>";
        h += "<tr><td>峰值灯油</td><td>" + E.fmt(s.run.peak) + "</td></tr>";
        h += "<tr><td>已建 / 已研究</td><td>" + E.builtCount() + "/" + NB + " · " + E.researchedCount() + "/" + NT + "</td></tr>";
        h += "<tr><td>可得信标</td><td>" + (gain > 0 ? "+" + gain : "不足 1，继续攒灯油") + "</td></tr>";
        const nextN = s.ember + gain;
        let nb = 0; for (let i = 0; i < nextN; i++) nb += i < 3 ? 0.08 : i < 6 ? 0.10 : 0.12;
        h += "<tr><td>信标倍率</td><td>×" + E.fmt(R.emberMult) + " → ×" + E.fmt(1 + nb) + "</td></tr>";
        h += "<tr><td>下局阈值</td><td>累计灯油 " + E.fmt(20000 * Math.pow(1.5, s.rebirths + 1)) + "</td></tr>";
        h += "</table>";
        h += '<div class="note">换门重置 ' + NB + " 座建筑、本局资源、全部研究与收复的全部据点（军队解散）；保留信标与档案。这扇门的世界会熄灭，但你的名字刻在墙上——信标就是刻痕。</div>";
        if (gain >= 1) {
            h += '<div class="group-head">选择开局遗产（三选一）</div>';
            h += '<button class="wide" data-act="legacy" data-kind="insight"><b>额外信念</b><span class="txt">开局 +' + E.fmt(1000 * (s.rebirths + 1)) + " 信念，科技起步更快</span></button>";
            h += '<button class="wide" data-act="legacy" data-kind="tech"><b>起手科技</b><span class="txt">随机一项早期科技直接完成</span></button>';
            h += '<button class="wide" data-act="legacy" data-kind="bld"><b>起手建筑</b><span class="txt">随机一座基础建筑白送 5 座，另有五名生还者同行</span></button>';
        } else {
            h += '<div class="note">信标不足 1，继续攒灯油。</div>';
        }
        h += "</div>";
        return h;
    }

    // ---------- 中栏：档案 ----------
    function renderArchive() {
        const s = E.state;
        let h = '<div class="pane"><div class="group-head">回廊档案 · 最近 ' + s.archive.length + " 门</div>";
        if (!s.archive.length) {
            h += '<div class="archive-empty">还没有换门记录。第一扇门要等这一局点亮。</div>';
        } else {
            h += '<table style="width:100%"><tr><th>时长</th><th>峰值灯油</th><th>已建</th><th>信标</th><th>时间</th></tr>';
            for (const a of s.archive) {
                h += "<tr><td>" + E.fmtDur(a.dur / 1000) + "</td><td>" + E.fmt(a.peak) + "</td><td>" +
                    a.built + "/" + NB + "</td><td>+" + a.ember + "</td><td>" +
                    new Date(a.at).toLocaleDateString() + "</td></tr>";
            }
            h += "</table>";
        }
        h += "</div>";
        return h;
    }

    // ---------- 中栏：选项 ----------
    function renderOptions() {
        const st = E.state.settings;
        const row = (id, name, on, hint) =>
            '<div class="info-row"><span>' + name + '<span class="hint">' + hint + "</span></span>" +
            '<button data-act="toggle" data-id="' + id + '">' + (on ? "开" : "关") + "</button></div>";
        let h = '<div class="pane"><div class="group-head">自动操作</div>';
        h += row("autoBuild", "自动建造", st.autoBuild, "每秒自动建最便宜的可建建筑");
        h += row("autoRebirth", "自动换门", st.autoRebirth, "信标可得 3 以上时自动换门");
        h += '<div class="group-head" style="margin-top:8px">存档</div>';
        h += '<div class="info-row"><span>立即保存</span><button data-act="save">保存</button></div>';
        h += '<div class="info-row"><span>清空存档<span class="hint">不可恢复</span></span><button data-act="wipe">清空</button></div>';
        h += '<div class="note">每 5 秒自动保存，离线收益上限 12 小时。人一直都在——住房给人生的地方，人口=住房容量即时就位；生还者用灯 0.1/秒、在家士兵 0.05，缺灯人变灰迟钝、产能打折（人不离开）；出征中部队不耗灯；打不赢的据点不允许出征；士兵存活出征 1/3/6 次自动升星，战损先扣新兵。效率型科技研究后对应产出永久提升。换门阈值 20000×1.5^次数——这是以「天」计的长线。</div>';
        h += "</div>";
        return h;
    }

    // ---------- 联动高亮：悬浮资源 → 高亮产出（绿）/消耗（红）建筑卡 ----------
    function applyHl() {
        const cards = document.querySelectorAll('#main .bcard[data-id]');
        if (!hlRes) { cards.forEach(el => el.classList.remove("hl-src", "hl-use")); return; }
        cards.forEach(el => {
            const b = C.BM[el.dataset.id];
            el.classList.remove("hl-src", "hl-use");
            if (!b) return;
            if (b.prod && b.prod[hlRes]) el.classList.add("hl-src");
            else if ((b.recipe && b.recipe[hlRes]) || (b.supply && b.supply[hlRes])) el.classList.add("hl-use");
        });
    }

    // ---------- 主渲染 ----------
    function mainSig() {
        const s = E.state;
        const afford = C.B.map(b => {
            const lv = s.run.fac[b.id] || 0;
            return buildBlock(b, lv) === null ? 1 : 0;
        }).join("");
        const techAfford = Object.keys(C.T).map(id => {
            const t = C.T[id];
            return E.available(id) && Object.keys(t.price).every(k => s.run.res[k] >= t.price[k]) ? 1 : 0;
        }).join("");
        return [tab, world, JSON.stringify(s.run.fac), JSON.stringify(s.run.act),
            Math.floor(E.gloryInfo().ratio * 20),   // 故事按荣光进度解锁（5% 粒度触发重渲染）
            Object.keys(C.T).map(id => (E.techDone(id) ? 1 : 0)).join(""),
            afford, techAfford, Math.floor(s.run.pop * 10), Math.floor(E.idlePop() * 10),
            Object.keys(s.seenRes).join(","),
            E.rebirthGain(), JSON.stringify(s.settings),
            s.archive.length, s.unlockedWorlds.join(","),
            tab === "rebirth" ? Math.floor((Date.now() - s.run.start) / 10000) : 0,
            JSON.stringify(s.run.mil.army), JSON.stringify(s.run.node),
            s.run.exp ? s.run.exp.node + ":" + Math.floor(Math.max(0, s.run.exp.dur - (Date.now() - s.run.exp.start) / 1000) / 2) : "",
            selNode || "", JSON.stringify(expTroops), Math.floor(E.milMult() * 100),
            JSON.stringify(s.run.mil.vet), s.ember].join("|");
    }
    // ---------- 回廊记事：随荣光进度逐段解锁的故事 ----------
    function renderStory() {
        const g = E.gloryInfo();
        const pct = Math.min(100, g.ratio * 100);
        let h = '<div class="pane"><div class="group-head">回廊记事 <span class="cat-sub">荣光进度点亮这段路——每一段，都是这个世界末日的一块拼图</span></div>';
        h += '<div class="story-progress">' +
            '<div class="glory-track" style="margin-top:6px"><div class="glory-fill" style="width:' + Math.min(100, pct) + '%"></div></div>' +
            '<div class="pop-sub" style="margin:4px 0 2px">人类的荣光 · 拯救此世界：' + (pct >= 100 ? "完成" : pct.toFixed(1) + "%") + " · 累计灯油 " + E.fmt(g.heatTotal) + " / " + E.fmt(g.threshold) + "</div></div>";
        let unlocked = 0;
        for (const frag of C.STORY) {
            if (g.ratio >= frag.ratio) {
                unlocked++;
                h += '<div class="story-card"><div class="story-title">' + esc(frag.title) + "</div>" +
                    '<div class="story-text">' + esc(frag.text) + "</div></div>";
            } else {
                h += '<div class="story-card locked"><div class="story-title dim">？？？？？</div>' +
                    '<div class="story-text dim">荣光进度达到 ' + Math.round(frag.ratio * 100) + "% 后解锁</div></div>";
            }
        }
        h += "</div>";
        return h;
    }

    let lastMainSig = "";
    function renderMain() {
        const sig = mainSig();
        if (sig === lastMainSig) return;
        lastMainSig = sig;
        let h;
        if (world !== "w1") {
            h = renderWorldPlaceholder(world);
        } else if (tab === "build") h = renderBuild();
        else if (tab === "tech") h = renderTech();
        else if (tab === "front") h = renderFront();
        else if (tab === "story") h = renderStory();
        else if (tab === "rebirth") h = renderRebirth();
        else if (tab === "archive") h = renderArchive();
        else h = renderOptions();
        $("#main").innerHTML = h;
        applyHl();
    }

    function renderLog() {
        const box = $("#log-box");
        const lines = E.logs.slice(-40).reverse();
        box.innerHTML = lines.map(l => '<div class="log-line">' + esc(l.m) + "</div>").join("");
    }

    function renderAll() {
        renderStatus();
        renderWorldTabs();
        renderTabs();
        renderLeft();
        renderMain();
        renderLog();
    }

    // ---------- 事件 ----------
    document.body.addEventListener("click", (ev) => {
        const el = ev.target.closest("[data-tab],[data-wtab],[data-act]");
        if (!el) return;
        if (el.dataset.tab) { tab = el.dataset.tab; renderTabs(); renderMain(); return; }
        if (el.dataset.wtab) {
            world = el.dataset.wtab;
            renderWorldTabs(); renderMain();
            return;
        }
        const act = el.dataset.act;
        if (act === "buy") {
            const b = C.BM[el.dataset.id];
            const block = b ? buildBlock(b, E.state.run.fac[b.id] || 0) : null;
            if (block) E.note("「" + b.name + "」暂时建不了：" + block + "。");
            else E.buy(b.id, 1);
        }
        else if (act === "max") {
            let n = 0;
            while (n < 100 && E.buy(el.dataset.id, 1)) n++;
            if (n > 0) E.note(C.BM[el.dataset.id].name + " 一键建造 " + n + " 座。");
        }
        else if (act === "up") {
            if (!E.setActive(el.dataset.id, 1)) E.note("「" + C.BM[el.dataset.id].name + "」激活失败：空闲人手不足。");
        }
        else if (act === "down") E.setActive(el.dataset.id, -1);
        else if (act === "sell") E.sellOne(el.dataset.id);
        else if (act === "tech") E.research(el.dataset.id);
        else if (act === "rec") {
            const n = parseInt(el.dataset.n) || 1;
            let done = 0;
            for (let i = 0; i < n; i++) if (E.recruit(el.dataset.id, 1)) done++;
            if (!done) E.note("编不了兵：空闲居民、营房容量或材料不足。");
        }
        else if (act === "nsel") { selNode = el.dataset.id; expTroops = {}; }
        else if (act === "nsel-x") { selNode = null; expTroops = {}; }
        else if (act === "tp") {
            const id = el.dataset.id, dn = parseInt(el.dataset.n) || 0;
            const home = E.state.run.mil.army[id] || 0;
            expTroops[id] = Math.max(0, Math.min(home, (expTroops[id] || 0) + dn));
        }
        else if (act === "go") {
            if (E.dispatch(selNode, Object.assign({}, expTroops))) { selNode = null; expTroops = {}; }
            else E.note("出发失败：队伍已在外或据点状态变化。");
        }
        else if (act === "legacy") E.rebirth(el.dataset.kind);
        else if (act === "toggle") {
            const k = el.dataset.id;
            E.state.settings[k] = !E.state.settings[k];
        }
        else if (act === "save") { E.save(); }
        else if (act === "wipe") {
            if (confirm("确定清空存档？信标、档案与已开放世界将全部丢失。")) E.wipe();
        }
        renderAll();
    });

    // ---------- 悬浮提示框（独立于主区，重绘不影响） ----------
    const tipEl = document.createElement("div");
    tipEl.id = "tip";
    tipEl.style.display = "none";
    document.body.appendChild(tipEl);
    let tipTarget = null;
    function placeTip(e) {
        const pad = 14;
        let x = e.clientX + pad, y = e.clientY + pad;
        const r = tipEl.getBoundingClientRect();
        if (x + r.width > window.innerWidth - 8) x = e.clientX - r.width - pad;
        if (y + r.height > window.innerHeight - 8) y = e.clientY - r.height - pad;
        tipEl.style.left = x + "px";
        tipEl.style.top = y + "px";
    }
    document.addEventListener("mouseover", (e) => {
        const t = e.target.closest("[data-tip]");
        if (t === tipTarget) return;
        tipTarget = t;
        if (!t) {
            tipEl.style.display = "none";
            if (hlRes) { hlRes = null; applyHl(); }
            return;
        }
        const [kind, id] = t.dataset.tip.split(":");
        if (kind === "bld") tipEl.innerHTML = bldTip(id);
        else if (kind === "res") tipEl.innerHTML = resTip(id);
        else if (kind === "tech") tipEl.innerHTML = techTip(id);
        else tipEl.innerHTML = "";
        tipEl.style.display = "block";
        placeTip(e);
        // 联动高亮：资源行 → 建筑卡
        const newHl = kind === "res" && id !== "ember" ? id : null;
        if (newHl !== hlRes) { hlRes = newHl; applyHl(); }
    });
    document.addEventListener("mousemove", (e) => { if (tipTarget) placeTip(e); });

    // ---------- 启动 ----------
    E.boot();
    // tick 驱动：状态/左栏/日志降到 1 秒一刷；主区签名比对后按需重绘
    let lastTickUi = 0;
    E.onChange(() => {
        const now = Date.now();
        if (now - lastTickUi >= 1000) {
            lastTickUi = now;
            renderStatus();
            renderLeft();
            renderLog();
        }
    });
    setInterval(renderMain, 300);
    setInterval(renderWorldTabs, 1000);
    renderAll();
})();
