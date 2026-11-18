// engine.js — 《梦境回廊 · 腐土》核心引擎 v2（循环重设版）
// 核心循环：资源采集 → 生产加工 → 消耗 → 解锁建筑与科技 → 更高效率再生产
// 基础采集/加工/住房开局无锁；科技分三类：unlock(解锁新链) / boost(资源产出永久+%) / mil(军备)
// 沿用：建筑两态制 / 迭代效率引擎 / 资源上限 / 平价成本+科技折减 / 灯油驱动 / 军队开垦（进攻向） / 被动老兵制
window.EM = (function () {
    const C = window.C;
    const SAVE_KEY = "dream_corridor_fotu_v3";
    const TIER_STEP = 10;      // 每 10 级一次产能阶跃
    const TIER_MULT = 2.5;
    const OFFLINE_CAP = 12 * 3600;
    const DISC = 0.85;         // 相关科技折减系数（每项 ×0.85，可叠加）
    const TAU = 20;            // 库存缓冲时间常数（秒）：可动用消耗速率 = 产能 + 库存/TAU
    const EFF_FLOOR = 0.01;    // 迭代效率下限（避免归零抖动）
    const JOBS_FLOOR = 0.1;    // 人手不足时的效率下限
    const ITER = 8;            // 效率迭代次数
    const HEAT_PER_POP = 0.1;  // 每名居民用灯油/秒（研究灯火苏醒后开始需求）
    const HEAT_PER_SOLDIER = 0.05; // 每名在家士兵用灯油/秒（减半，出征在外不计）
    const POWER_PER_POP = 0.05; // 每人用电/秒（第一次发电后开始需求）
    const WARM_FLOOR = 0.5;    // 全面受寒时的产能保底系数（缺灯：人变灰迟钝，活力下降——人一直在，不离开）
    const VET_STEPS = [1, 3, 6];          // 存活出征次数门槛：一星/二星/三星
    const VET_POW = [0, 0.15, 0.30, 0.50];    // 星级战力加成
    const VET_LOSS = [0, 0.10, 0.20, 0.30];   // 星级自身战损减免
    const REBIRTH_BASE = 20000, REBIRTH_GROW = 1.5; // 换门阈值 20000×1.5^n（长线：第一扇门以「天」为单位）
    const EMBER_MIL = 0.10;    // 信标全军战力加成/个
    const FLOWS = ["wood", "stone", "heat", "insight"]; // 建材/粮食/灯油/信念

    let S = null;
    const logs = [];
    let changeCb = null;
    let autoClock = 0;

    // ---------- 存档 ----------
    function save() {
        try { S.savedAt = Date.now(); localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { }
    }
    function load() {
        try {
            const raw = localStorage.getItem(SAVE_KEY);
            if (raw) {
                S = JSON.parse(raw);
                // 旧档兼容：激活数不得超过建成数（修复早期建造时 act 虚高导致「停用无效」的存档）
                if (S.run && S.run.fac && S.run.act) {
                    for (const id in S.run.fac) {
                        const f = Math.max(0, S.run.fac[id] || 0);
                        S.run.fac[id] = f;
                        if (S.run.act[id] === undefined) S.run.act[id] = f;
                        else S.run.act[id] = Math.max(0, Math.min(S.run.act[id], f));
                    }
                }
                return true;
            }
        } catch (e) { }
        return false;
    }
    function wipe() {
        localStorage.removeItem(SAVE_KEY);
        S = freshState();
        logs.length = 0;
        log("存档已清空。腐土。规划者，带着先遣队和大厅重新落地。");
    }

    // ---------- 状态 ----------
    function defaultRun() {
        const res = { wood: 60, stone: 0, heat: 0, insight: 0 }; // 远征队携行物资：建材
        return {
            res,
            fac: { hall: 1 },                   // 建成数（第一炉火预建 1 级——核心锚点兼基地）
            act: { hall: 1 },                   // 激活数（≤ fac；停用不占人手不耗投入）
            pop: 5,                             // 基础人力：开荒先遣队 5 人，随住房/大厅容量即时就位
            tech: {},                           // id -> true（已研究）
            coldFlag: false,                    // 受寒警示（只报一次，回暖重置）
            mil: { army: {}, vet: {} },         // 在家军队：army[兵种id]=数量；vet[兵种id]={存活次数:人数}
            node: {},                           // 已收复据点：id -> true
            exp: null,                          // 在外队伍 {node,troops,vet,start,dur,pow}
            heatTotal: 0,
            start: Date.now(),
            peak: 0,
        };
    }
    function freshState() {
        return {
            rebirths: 0,
            ember: 0,
            emberTotal: 0,
            unlockedWorlds: ["w1"],
            archive: [],
            settings: { autoBuild: false, autoRebirth: false },
            seenRes: {},
            seenEra: 0,
            campTier: 0,
            savedAt: 0,
            run: defaultRun(),
        };
    }

    // 营地档位（随人口升档更名）
    function campTierOf(pop) {
        let t = 0;
        for (let i = 0; i < C.CAMP_TIERS.length; i++) if (pop >= C.CAMP_TIERS[i].min) t = i;
        return t;
    }
    function campName() { return C.CAMP_TIERS[campTierOf(S.run.pop)].name; }

    // ---------- 数值 ----------
    function tierOf(lv) { return Math.floor(lv / TIER_STEP); }
    function tierMult(lv) { return Math.pow(TIER_MULT, tierOf(lv)); }

    // 平价：同一建筑每座造价固定；相关科技每研究一项 ×0.85（材料越用越少，符合逻辑）
    function discOf(b) {
        if (!b.disc) return 1;
        let m = 1;
        for (const t of b.disc) if (techDone(t)) m *= DISC;
        return m;
    }
    function costOf(b, lv) {
        const d = discOf(b), m = {};
        for (const k in b.cost) m[k] = b.cost[k] * d;
        return m;
    }
    function fmt(n) {
        if (!isFinite(n)) return "∞";
        const neg = n < 0; n = Math.abs(n);
        let s;
        if (n < 1000) s = n < 10 ? n.toFixed(2).replace(/\.?0+$/, "") : n < 100 ? n.toFixed(1) : String(Math.floor(n));
        else if (n < 1e6) s = (n / 1e3).toFixed(2) + "K";
        else if (n < 1e9) s = (n / 1e6).toFixed(2) + "M";
        else if (n < 1e12) s = (n / 1e9).toFixed(2) + "G";
        else s = (n / 1e12).toFixed(2) + "T";
        return (neg ? "-" : "") + s;
    }
    function fmtDur(sec) {
        sec = Math.floor(sec);
        const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
        return h > 0 ? h + "时" + m + "分" : m > 0 ? m + "分" + s + "秒" : s + "秒";
    }

    // ---------- 科技（购买制） ----------
    function techDone(id) { return !!S.run.tech[id]; }
    function available(id) {
        const t = C.T[id];
        if (!t || techDone(id)) return false;
        if (t.pre && !techDone(t.pre)) return false;
        if (t.req && !(S.run.fac[t.req] > 0)) return false;
        return true;
    }
    function researchable() { return Object.keys(C.T).filter(available); }
    function research(id) {
        const t = C.T[id];
        if (!available(id) || !canAfford(t.price)) return false;
        for (const k in t.price) S.run.res[k] -= t.price[k];
        S.run.tech[id] = true;
        log("「" + t.name + "」研究完成。" + t.desc);
        onTechDone(id, t);
        return true;
    }

    // ---------- 建筑 ----------
    function unlocked(b) {
        if (b.tech && !techDone(b.tech)) return false;
        if (b.req && !(S.run.fac[b.req] > 0)) return false;
        return true;
    }
    function actOf(id) {
        const f = S.run.fac[id] || 0;
        const a = S.run.act[id];
        return Math.max(0, Math.min(a === undefined ? f : a, f));
    }
    function eraUnlocked(n) { return C.B.some(b => b.era === n && unlocked(b)); }
    function currentEra() {
        let e = 1;
        for (const { n } of C.ERAS) if (eraUnlocked(n)) e = n;
        return e;
    }
    function builtCount() { return Object.values(S.run.fac).filter(v => v > 0).length; }
    function researchedCount() { return Object.keys(S.run.tech).length; }

    // ---------- 人口 ----------
    function staffed() {
        let n = milHome();   // 在家士兵也是人，占人手（出征在外的除外）
        for (const b of C.B) n += (b.jobs || 0) * actOf(b.id);
        return n;
    }
    function idlePop() { return S.run.pop - staffed(); }

    // ---------- 军队（居民转职，占人手占灯油；出征在外不占岗位不耗灯油） ----------
    function milHome() {
        let n = 0;
        for (const k in S.run.mil.army) n += S.run.mil.army[k];
        return n;
    }
    function milTotal() {
        const exp = S.run.exp;
        let n = milHome();
        if (exp) for (const k in exp.troops) n += exp.troops[k];
        return n;
    }
    function milCap() {
        let cap = 0;
        for (const b of C.B) if (b.milCap) cap += b.milCap * (S.run.fac[b.id] || 0);
        return cap;
    }
    // 老兵：按「存活出征次数」分桶。1/3/6 次 → 一/二/三星
    function starOf(times) { return times >= VET_STEPS[2] ? 3 : times >= VET_STEPS[1] ? 2 : times >= VET_STEPS[0] ? 1 : 0; }
    function vetBuckets(id) {
        const v = S.run.mil.vet[id] || {};
        const out = [];
        for (const t in v) if (v[t] > 0) out.push({ times: +t, count: v[t] });
        out.sort((a, b) => a.times - b.times);
        return out;
    }
    function vetSummary(id) {
        const bs = vetBuckets(id);
        const total = bs.reduce((s, x) => s + x.count, 0);
        const stars = [0, 0, 0, 0];
        let top = 0, nextNeed = VET_STEPS[0];
        for (const x of bs) { stars[starOf(x.times)] += x.count; top = Math.max(top, x.times); }
        if (top >= VET_STEPS[2]) nextNeed = null;
        else if (top >= VET_STEPS[1]) nextNeed = VET_STEPS[2];
        else if (top >= VET_STEPS[0]) nextNeed = VET_STEPS[1];
        return { total, stars, star: starOf(top), top, nextNeed };
    }
    // 军团加成：建筑 effMil + 信标战力 +10%/个
    function milMult() {
        let e = 0;
        for (const b of C.B) if (b.effMil) e += b.effMil * (S.run.fac[b.id] || 0);
        return 1 + e + S.ember * EMBER_MIL;
    }
    // 从分桶按比例抽 n 名（余数给低星），返回 {times:count}
    function pullVet(id, n) {
        const bs = vetBuckets(id);
        const total = bs.reduce((s, x) => s + x.count, 0);
        if (total < n) return null;
        const take = {}, rem = bs.map(x => ({ times: x.times, count: x.count }));
        let left = n;
        for (const x of rem) {
            const q = Math.floor(x.count * n / total);
            if (q) { take[x.times] = q; x.count -= q; left -= q; }
        }
        for (const x of rem) {
            while (left > 0 && x.count > 0) {
                take[x.times] = (take[x.times] || 0) + 1; x.count--; left--;
            }
        }
        return take;
    }
    // 编制：n 名居民转职为兵种 id（需空闲居民、营房容量、编制资源）
    function recruit(id, n) {
        const a = C.AM[id];
        if (!a || n <= 0 || !techDone(a.tech)) return false;
        const r = S.run;
        if (milTotal() + n > milCap()) return false;
        if (idlePop() < n) return false;
        const cost = {};
        for (const k in a.cost) cost[k] = a.cost[k] * n;
        if (!canAfford(cost)) return false;
        for (const k in cost) r.res[k] -= cost[k];
        r.mil.army[id] = (r.mil.army[id] || 0) + n;
        r.mil.vet[id] = r.mil.vet[id] || {};
        r.mil.vet[id][0] = (r.mil.vet[id][0] || 0) + n;   // 新兵：0 次存活
        if ((r.mil.army[id] || 0) === n) log("第一批「" + a.name + "」入营。" + a.desc);
        return true;
    }
    // 战力：Σ 兵种战力 × 数量 × (1+星级加成) × 军团加成（含信标）
    // troopVet 为可选分桶（出征队伍的存活次数分布）；不传则按该兵种在家平均星级估算
    function troopsPow(troops, troopVet) {
        let p = 0;
        for (const k in troops) {
            const a = C.AM[k];
            if (!a || !(troops[k] > 0)) continue;
            const n = troops[k];
            const v = troopVet ? troopVet[k] : r_milVet(k);
            let base = 0, cnt = 0;
            if (v) for (const t in v) { base += v[t] * (1 + VET_POW[starOf(+t)]); cnt += v[t]; }
            const unit = cnt > 0 ? base / cnt : 1;
            p += a.pow * n * unit;
        }
        return p * milMult();
    }
    function r_milVet(k) { return S.run.mil.vet[k]; }
    // 出征耗时（雷达站/后勤科技提速）
    function expDur(nodeId) {
        const node = C.NM[nodeId];
        if (!node) return 0;
        let cut = 0;
        for (const b of C.B) if (b.timeCut) cut += b.timeCut * (S.run.fac[b.id] || 0);
        if (techDone("logistics")) cut += 0.15;
        return node.time * Math.max(0.3, 1 - cut);
    }
    // 派单出征：单队伍串行，战力≥守军才放行（打不赢不让出，从源头消灭挫败）
    function dispatch(nodeId, troops) {
        const node = C.NM[nodeId];
        const r = S.run;
        if (!node || r.exp || r.node[nodeId]) return false;
        let any = 0;
        for (const k in troops) {
            if (!C.AM[k] || !(troops[k] > 0)) { delete troops[k]; continue; }
            if (troops[k] > (r.mil.army[k] || 0)) return false;   // 在家兵不足
            any += troops[k];
        }
        if (!any) return false;
        // 按分桶比例抽兵（新老搭配随队；战损时先扣新兵，老兵自然更易存活归来积累经验）
        const troopVet = {};
        for (const k in troops) {
            const taken = pullVet(k, troops[k]);
            if (!taken) return false;
            troopVet[k] = taken;
            for (const t in taken) r.mil.vet[k][t] -= taken[t];
            r.mil.army[k] -= troops[k];
        }
        const pow = troopsPow(troops, troopVet);
        if (pow < node.garrison) {   // 战力不足：原样退回
            for (const k in troops) {
                r.mil.army[k] += troops[k];
                for (const t in troopVet[k]) r.mil.vet[k][t] += troopVet[k][t];
            }
            return false;
        }
        r.exp = { node: nodeId, troops, vet: troopVet, start: Date.now(), dur: expDur(nodeId), pow };
        log("队伍向「" + node.name + "」进发，战力 " + fmt(pow) + " 对守军 " + fmt(node.garrison) + "。");
        return true;
    }
    // 结算：战损顺序「先新兵后老兵、同级内先低兵种」；幸存者存活次数 +1（可晋升老兵）
    function settleExpedition() {
        const exp = S.run.exp;
        if (!exp) return;
        const node = C.NM[exp.node];
        const total = Object.values(exp.troops).reduce((s, v) => s + v, 0);
        const ratio = Math.min(1, node.garrison / exp.pow);
        let lossRate = 0.25 * ratio;                 // 险胜损高，碾压趋近零
        if (techDone("drill")) lossRate *= 0.8;      // 战术操典
        // 待扣队列：{兵种, 存活次数, 星级}，先按星级升序（新兵先死），同级内按兵种序号（低级先死）
        const queue = [];
        const armyOrder = C.ARMY.map(a => a.id);
        for (const k in exp.troops) {
            const v = exp.vet[k] || { 0: exp.troops[k] };
            for (const t in v) for (let i = 0; i < v[t]; i++)
                queue.push({ k, times: +t, star: starOf(+t) });
        }
        queue.sort((a, b) => a.star - b.star || armyOrder.indexOf(a.k) - armyOrder.indexOf(b.k) || a.times - b.times);
        // 老兵自身战损减免：按星级权重（1 / 0.9 / 0.8 / 0.7）缩放总阵亡数，再按队列顺序（新兵优先）扣
        let weightSum = 0;
        for (const u of queue) weightSum += 1 - VET_LOSS[u.star];
        const loss = Math.min(queue.length, Math.ceil(weightSum * lossRate));
        let dead = 0, promoted = 0;
        for (let i = 0; i < queue.length; i++) {
            const u = queue[i];
            if (i < loss) { dead++; continue; }
            const nt = u.times + 1;
            S.run.mil.army[u.k] = (S.run.mil.army[u.k] || 0) + 1;
            const v = S.run.mil.vet[u.k] || (S.run.mil.vet[u.k] = {});
            v[nt] = (v[nt] || 0) + 1;
            if (starOf(nt) > u.star) promoted++;
        }
        // 战斗只损军队（人一直都在：阵亡的是兵，房子空出的位子立刻有人补上）
        for (const k in node.loot) S.run.res[k] += node.loot[k];
        S.run.node[node.id] = true;
        S.run.exp = null;
        log((dead > 0 ? "收复「" + node.name + "」，阵亡 " + dead + " 名战士。" : "零伤亡收复「" + node.name + "」。") +
            (promoted ? " " + promoted + " 名生还者晋升老兵。" : "") +
            "缴获已入库，据点收益开始计入。" + node.desc);
    }

    function canAfford(cost) {
        for (const k in cost) if (S.run.res[k] < cost[k]) return false;
        return true;
    }
    function buy(id, n) {
        const b = C.BM[id];
        if (!b || !unlocked(b)) return false;
        n = n || 1;
        let lv = S.run.fac[id] || 0;
        if (b.jobs && idlePop() < b.jobs * n) return false;   // 人手不足，建不了
        const total = {};
        for (let i = 0; i < n; i++) {
            const c = costOf(b, lv + i);
            for (const k in c) total[k] = (total[k] || 0) + c[k];
        }
        if (!canAfford(total)) return false;
        for (const k in total) S.run.res[k] -= total[k];
        const wasZero = lv === 0;
        const tierBefore = tierOf(lv);
        const actBefore = actOf(id);                          // 先按旧 fac 取激活数（fac 未更新，避免虚高）
        S.run.fac[id] = lv + n;
        S.run.act[id] = actBefore + n;                        // 建成即激活
        if (b.cap) {
            S.run.pop += b.cap * n;
            log(b.name + " 建成，" + b.cap * n + " 名生还者有了活的地方——人一直在，房子让他们停下来。");
        } else if (wasZero) {
            log("建成 " + b.name + (b.jobs ? "，派了 " + b.jobs + " 人进驻。" : "。") + b.desc);
        }
        const tierAfter = tierOf(lv + n);
        if (tierAfter > tierBefore) log(b.name + " 进入第 " + (tierAfter + 1) + " 代，产能提升。");
        return true;
    }
    // 两态切换：dir=+1 激活一座（需空闲人手），dir=-1 停用一座（腾出人手）
    function setActive(id, dir) {
        const b = C.BM[id];
        if (!b) return false;
        const lv = S.run.fac[id] || 0;
        let a = actOf(id);
        if (dir > 0) {
            if (a >= lv) return false;
            if (b.jobs && idlePop() < b.jobs) return false;
            a++;
        } else {
            if (a <= 0) return false;
            a--;
        }
        S.run.act[id] = a;
        return true;
    }
    function sellOne(id) {
        const b = C.BM[id];
        const lv = S.run.fac[id] || 0;
        if (!b || lv <= 0) return false;
        if (b.core) return false;               // 第一炉火不可拆除
        const c = costOf(b, lv - 1);
        for (const k in c) S.run.res[k] += c[k] * 0.5;
        S.run.fac[id] = lv - 1;
        if (actOf(id) > lv - 1) S.run.act[id] = lv - 1;
        if (b.cap) S.run.pop = Math.max(0, S.run.pop - b.cap);   // 拆住房：容量下降，下一 tick 人口随容量回落
        return true;
    }

    // ---------- 迭代效率引擎 ----------
    // 每座激活建筑一个效率因子 eff(0~1]：
    //   · 消耗（recipe+supply）统一受约束：需求 > (产能 + 库存/TAU) 时按比例降效，迭代收敛
    //   · 人手不足（拆房导致）时全局按人口比降效兜底
    //   · 投入充足 → 100%；投入短缺 → 平滑降到下限，不再有"热/电配额一刀切"
    function rates() {
        const r = S.run;
        // 静态聚合（按建成数，与激活无关）
        let capPop = 0, effAdd = 0, egAdd = 0;
        const store = { wood: 150, stone: 150, heat: 200, insight: 0 }; // 信念不设上限
        for (const b of C.B) {
            const lv = r.fac[b.id] || 0;
            if (!lv) continue;
            if (b.cap) capPop += b.cap * lv;
            if (b.eff) effAdd += b.eff * lv;
            if (b.eg) egAdd += b.eg * lv;
            if (b.store) {
                for (const k in b.store) {
                    const v = b.store[k] * lv;
                    if (k === "*") for (const rk of ["wood", "stone", "heat"]) store[rk] += v;
                    else store[k] = (store[k] || 0) + v;
                }
            }
        }
        // 信标产量加成递增：第1-3个每个+8%、第4-6个每个+10%、第7个起每个+12%
        let eb = 0;
        for (let i = 0; i < S.ember; i++) eb += i < 3 ? 0.08 : i < 6 ? 0.10 : 0.12;
        const emberMult = 1 + eb;
        // 科技效率加成：效率型科技研究后对应资源全局产出永久提升
        const techBoost = {};
        for (const id in C.T) {
            const t = C.T[id];
            if (t.boost && techDone(id)) for (const k in t.boost) techBoost[k] = (techBoost[k] || 0) + t.boost[k];
        }
        // 据点收益聚合：pct 资源倍率 / flat 绝对产出 / global 全局倍率（永久驻防再 +25%）
        const pctB = {}, flatB = {};
        let gBoost = 0;
        const occMult = techDone("occupation") ? 1.25 : 1;
        for (const nid in r.node) {
            const node = C.NM[nid];
            if (!node || !node.gain) continue;
            if (node.gain.pct) for (const k in node.gain.pct) pctB[k] = (pctB[k] || 0) + node.gain.pct[k] * occMult;
            if (node.gain.flat) for (const k in node.gain.flat) flatB[k] = (flatB[k] || 0) + node.gain.flat[k] * occMult;
            if (node.gain.global) gBoost += node.gain.global * occMult;
        }
        const mult = emberMult * (1 + effAdd) * (1 + gBoost);

        // 激活集合与初始效率
        const act = {}, eff = {}, active = {};
        const actList = [];
        for (const b of C.B) {
            const a = actOf(b.id);
            act[b.id] = a;
            active[b.id] = false;
            if (a > 0 && unlocked(b)) { actList.push(b); eff[b.id] = 1; }
        }
        let jobsD = 0;
        for (const b of actList) if (b.jobs) jobsD += b.jobs * act[b.id];
        const jobsScale = jobsD > r.pop ? Math.max(JOBS_FLOOR, r.pop / jobsD) : 1;
        for (const b of actList) if (b.jobs) eff[b.id] *= jobsScale;

        // 人口需求：锚定后居民用灯油（兵减半、出征在外不计）——活着的居民就是锚的证明
        const popDem = { heat: 0 };
        if (techDone("fire")) {
            const milTotal_ = milTotal();
            const atHome = milHome();
            popDem.heat = Math.max(0, r.pop - milTotal_) * HEAT_PER_POP + atHome * HEAT_PER_SOLDIER;
        }

        let rawH = 0;             // 第一轮迭代的原始需求（覆盖率不受降效影响）
        // 迭代收敛
        for (let it = 0; it < ITER; it++) {
            const P = {}, D = {};
            for (const b of actList) {
                const e = eff[b.id];
                if (e <= 1e-6) continue;
                const a = act[b.id], tm = tierMult(r.fac[b.id] || 0);
                if (b.prod) for (const k in b.prod) P[k] = (P[k] || 0) + b.prod[k] * a * e * mult * tm;
                if (b.recipe) for (const k in b.recipe) D[k] = (D[k] || 0) + b.recipe[k] * a * e;
                if (b.supply) for (const k in b.supply) D[k] = (D[k] || 0) + b.supply[k] * a * e;
            }
            if (popDem.heat) D.heat = (D.heat || 0) + popDem.heat;
            if (it === 0) { rawH = D.heat || 0; }
            for (const b of actList) {
                if (!(b.recipe || b.supply)) continue;
                let scale = 1;
                const check = (k) => {
                    if (!D[k]) return;
                    const A = (P[k] || 0) + (r.res[k] || 0) / TAU;   // 可动用 = 产能 + 库存缓冲
                    if (D[k] > A) scale = Math.min(scale, A / D[k]);
                };
                if (b.recipe) for (const k in b.recipe) check(k);
                if (b.supply) for (const k in b.supply) check(k);
                if (scale < 1) eff[b.id] = Math.max(EFF_FLOOR, eff[b.id] * scale);
            }
        }

        // 汇总实际收支（消耗不随产能倍率放大，与旧版口径一致）
        const inc = {}, cons = {};
        for (const k of FLOWS) { inc[k] = 0; cons[k] = 0; }
        for (const b of actList) {
            const e = eff[b.id];
            if (e <= 1e-6) continue;
            active[b.id] = true;
            const a = act[b.id], tm = tierMult(r.fac[b.id] || 0);
            if (b.prod) for (const k in b.prod) inc[k] += b.prod[k] * a * e * mult * tm;
            if (b.recipe) for (const k in b.recipe) cons[k] += b.recipe[k] * a * e;
            if (b.supply) for (const k in b.supply) cons[k] += b.supply[k] * a * e;
        }
        // 灯油覆盖率：可动用（产能+库存缓冲）/ 原始需求（含人口）
        const covH = rawH > 1e-9 ? Math.min(1, (inc.heat + (r.res.heat || 0) / TAU) / rawH) : 1;
        const covP = 1;
        // 缺灯折扣：只扣人的劳动产出（灯油设施/据点产出不受影响），避免死亡螺旋
        const warm = covH >= 1 ? 1 : WARM_FLOOR + (1 - WARM_FLOOR) * covH;
        for (const k of ["wood", "stone", "insight"]) inc[k] *= warm;

        // 人口消耗并入收支（tick/离线补算统一走 inc-cons）
        cons.heat += popDem.heat;

        // 科技效率加成并入产出（消耗侧不受影响）
        for (const k of FLOWS) if (techBoost[k]) inc[k] *= 1 + techBoost[k];

        // 据点绝对产出（不受受寒/效率影响，受信标倍率）；%加成缩放建筑产出
        for (const k in flatB) inc[k] = inc[k] * (1 + (pctB[k] || 0)) + flatB[k] * emberMult;
        for (const k in pctB) if (!(k in flatB)) inc[k] *= 1 + pctB[k];

        return { inc, cons, eff, act, active, mult, emberMult, cap: capPop, jobsD, store, egAdd, pop: r.pop, staffed: jobsD, popDem, warm: covH, covP, gBoost, techBoost };
    }

    // ---------- tick ----------
    function tick(dt) {
        const R = rates();
        const r = S.run;
        for (const k in R.inc) {
            const capk = R.store[k] || 0;
            let v = r.res[k] + (R.inc[k] - R.cons[k]) * dt;
            if (capk > 0 && v > capk) v = capk;
            if (v < 0) v = 0;
            r.res[k] = v;
        }
        r.heatTotal += R.inc.heat * dt;
        r.peak = Math.max(r.peak, r.res.heat);

        // 人口观：人一直都在（灰地里游荡的活人不缺），住房给他们活下来的地方
        // → 人口 = 住房容量，即时就位；缺灯只降活力（产能打折），人不离开
        r.pop = R.cap;
        // 受寒警示（活力下降，只报一次）
        if (r.pop > 0 && R.warm < 1) {
            if (!r.coldFlag) { r.coldFlag = true; log("灯油不足，城里的人在变灰——手脚慢了，干什么都打折。"); }
        } else if (r.coldFlag) {
            r.coldFlag = false;
            log("灯油恢复了。灰从人身上退下去，活力回来了。");
        }
        // 出征结算（离线回来第一次 tick 也会自动补结算）
        if (r.exp && Date.now() - r.exp.start >= r.exp.dur * 1000) settleExpedition();

        autoTick();
        firstTimeChecks(R);
        return R;
    }

    function onTechDone(id, t) {
        if (id === "jump" && !S.unlockedWorlds.includes("w2")) {
            S.unlockedWorlds.push("w2");
            log("回廊定位完成：血旗 · 第二扇门进入了视野。但门要一扇一扇地开——先把腐土的灯点够亮。");
        }
    }

    function firstTimeChecks(R) {
        const r = S.run;
        for (const { id, name } of C.RES) {
            if (!S.seenRes[id] && r.res[id] > 0.5) {
                S.seenRes[id] = 1;
                log(name + " 第一次入库。");
            }
        }
        const e = currentEra();
        if (e > S.seenEra) {
            S.seenEra = e;
            const era = C.ERAS.find(x => x.n === e);
            log("第 " + e + " 纪 · " + era.name + "。");
        }
        // 营地更名（旧档首次载入时对齐档位、不误报）
        if (S.campTier === undefined) {
            S.campTier = campTierOf(r.pop);
        } else {
            const t = campTierOf(r.pop);
            if (t > S.campTier) {
                const oldName = C.CAMP_TIERS[S.campTier].name;
                S.campTier = t;
                const newName = C.CAMP_TIERS[t].name;
                log("生还者达到 " + C.CAMP_TIERS[t].min + " 人，「" + oldName + "」更名为「" + newName + "」。" + C.CAMP_TIERS[t].flavor);
            }
        }
    }

    // ---------- 自动化（默认全关，可选项） ----------
    function autoTick() {
        autoClock += 0.1;
        if (autoClock < 1) return;
        autoClock = 0;
        const st = S.settings;
        if (st.autoBuild) {
            let best = null, bestCost = Infinity;
            for (const b of C.B) {
                if (!unlocked(b)) continue;
                const lv = S.run.fac[b.id] || 0;
                if (lv >= 40) continue;
                const c = costOf(b, lv);
                let ok = true, sum = 0;
                for (const k in c) {
                    if (S.run.res[k] < c[k]) { ok = false; break; }
                    sum += c[k];
                }
                if (b.jobs && idlePop() < b.jobs) ok = false;
                if (ok && sum < bestCost) { best = b.id; bestCost = sum; }
            }
            if (best) buy(best, 1);
        }
        if (st.autoRebirth && rebirthGain() >= 3) {
            rebirth(["insight", "tech", "bld"][Math.floor(Math.random() * 3)]);
        }
    }

    // ---------- 换门 ----------
    function rebirthGain() {
        const threshold = REBIRTH_BASE * Math.pow(REBIRTH_GROW, S.rebirths);
        const ratio = S.run.heatTotal / threshold;
        if (ratio < 1) return 0;
        return Math.max(1, Math.floor(Math.pow(ratio, 0.6) * (1 + rates().egAdd)));
    }
    // 荣光进度：本局累计灯油 / 换门阈值——拯救这个世界的进度条
    function gloryInfo() {
        const threshold = REBIRTH_BASE * Math.pow(REBIRTH_GROW, S.rebirths);
        return { ratio: S.run.heatTotal / threshold, threshold, heatTotal: S.run.heatTotal };
    }
    function rebirth(kind) {
        const gain = rebirthGain();
        if (gain < 1) return null;
        S.archive.unshift({
            dur: Date.now() - S.run.start,
            peak: S.run.peak,
            built: builtCount(),
            ember: gain,
            at: Date.now(),
        });
        if (S.archive.length > 30) S.archive.pop();
        S.ember += gain;
        S.emberTotal += gain;
        S.rebirths++;
        S.campTier = 0;
        S.run = defaultRun();
        applyLegacy(kind);
        log("腐土的灯熄了，你走进了回廊。带着 " + gain + " 信标——下一扇门就在前方。");
        save();
        return gain;
    }
    function applyLegacy(kind) {
        const r = S.run;
        let name = "";
        if (kind === "insight") {
            r.res.insight += 1000 * S.rebirths;
            name = "额外信念";
        } else if (kind === "tech") {
            const pool = ["fire", "sort", "data", "agri2", "anchor2", "hoard"].filter(id => !techDone(id));
            const id = pool[Math.floor(Math.random() * pool.length)] || "fire";
            r.tech[id] = true;
            name = "起手科技 · " + C.T[id].name;
        } else {
            const pool = ["salvage", "scavenge", "farm", "marker"];
            const id = pool[Math.floor(Math.random() * pool.length)];
            r.fac[id] = 5;
            r.act[id] = 5;
            r.pop += 5;
            name = "起手建筑 · " + C.BM[id].name + "（另有五名生还者同行）";
        }
        log("新的一局。带上「" + name + "」。");
    }

    // ---------- 日志 ----------
    function log(msg) {
        logs.push({ t: Date.now(), m: msg });
        if (logs.length > 80) logs.shift();
    }

    // ---------- 启动 ----------
    function boot() {
        if (!load()) {
            S = freshState();
            log("腐土 · 第一扇门。远征队穿门而来：五人先遣队、一座开拓大厅、船货里的设备与一箱零件。");
            log("梦听得见人相信什么——盖起界碑、城墙、住房这些「人类相信自己」的东西，它们就会比钢铁还硬。灰地里的活人一直在游荡，给他们一块能活的地方。");
        } else if (S.savedAt) {
            const dt = Math.min((Date.now() - S.savedAt) / 1000, OFFLINE_CAP);
            if (dt > 60) {
                const R = rates();
                for (const k in R.inc) {
                    const capk = R.store[k] || 0;
                    let v = S.run.res[k] + (R.inc[k] - R.cons[k]) * dt;
                    if (capk > 0 && v > capk) v = capk;
                    if (v < 0) v = 0;
                    S.run.res[k] = v;
                }
                S.run.heatTotal += R.inc.heat * dt;
                log("离线 " + fmtDur(dt) + "，已按当前产出补算。");
            }
        }
        setInterval(() => { tick(0.1); if (changeCb) changeCb(); }, 100);
        setInterval(save, 5000);
        window.addEventListener("beforeunload", save);
    }

    return {
        boot, tick, rates, save, wipe,
        recruit, milHome, milTotal, milCap, milMult, troopsPow, expDur, dispatch, settleExpedition,
        starOf, vetBuckets, vetSummary, VET_STEPS, VET_POW, VET_LOSS,
        emberMilBonus: () => S.ember * EMBER_MIL,
        emberProdBonus: () => { let b = 0; for (let i = 0; i < S.ember; i++) b += i < 3 ? 0.08 : i < 6 ? 0.10 : 0.12; return b; },
        get state() { return S; },
        fmt, fmtDur,
        buy, sellOne, setActive, actOf, costOf, tierOf, tierMult,
        unlocked, eraUnlocked, currentEra, builtCount, researchedCount,
        available, researchable, research, techDone,
        staffed, idlePop, campName,
        rebirthGain, gloryInfo, rebirth,
        note: log,
        get logs() { return logs; },
        onChange(cb) { changeCb = cb; },
        C,
    };
})();
