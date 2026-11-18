// content.js — 《梦境回廊 · 腐土》内容配置 v4（设定文档版）
// 世界观：门后的梦世界正在熄灭；梦听得见人相信什么——人类相信的东西比钢铁硬。
// 资源体系（信念/建材/粮食/灯油）对齐设定文档；防守机制无（纯经营）；
// 第一炉火=核心锚点兼基地（替代开拓大厅）；信标=跨门永久加成（换门所得）。
// 核心循环：采集 → 加工 → 消耗 → 解锁 → 高效再生产
window.C = (function () {
    // 资源：信念=核心货币（越规整的建筑信念产出越高）；灯油=锚燃料（居民消耗+换门）
    const RES = [
        { id: "insight", name: "信念" },
        { id: "wood", name: "建材" },
        { id: "stone", name: "粮食" },
        { id: "heat", name: "灯油" },
    ];
    const RES_NAME = {};
    RES.forEach(r => (RES_NAME[r.id] = r.name));

    const ERAS = [
        { n: 1, name: "第一炉火" },
        { n: 2, name: "扎根" },
        { n: 3, name: "垦区" },
        { n: 4, name: "组织" },
        { n: 5, name: "碑林" },
        { n: 6, name: "回廊" },
    ];

    // 建筑：era(纪元) type(分组标题), tech(解锁科技,null=开局), core(第一炉火,不可拆),
    //   prod(产出/秒/激活级), recipe(物质消耗/秒/激活级), supply(灯油消耗/秒/激活级),
    //   jobs(人手占用/激活级), cap(人口容量/建成级), eff(全局产出+%/建成级),
    //   eg(信标获取+%/建成级), store(资源上限+建成级,"*"=全部),
    //   disc(相关科技:每项已研究→建造成本×0.85), cost(建造成本), desc
    const B = [
        // —— 基地（核心锚点：预建 1 级，可升级，不可拆除） ——
        { id: "hall", name: "第一炉火", era: 1, type: "基地", tech: null, core: true, cap: 5, eff: 0.02, prod: { heat: 0.8 }, cost: { wood: 60 }, desc: "拓荒者烧起的第一堆火，炉底结出灯油——回廊的灯、锚的运转，全靠它。每级：灯油 +0.8/秒、人口容量 +5、全局产出 +2%。炉火在，城就在。" },
        // —— 住房（营房：人口上限+兵员） ——
        { id: "hut", name: "营房", era: 1, type: "住房", tech: null, cap: 2, cost: { wood: 30 }, desc: "四面墙、一张通铺。灰地里的活人一直在游荡——人类在乎秩序，梦就给秩序力量：有屋顶的人，才算停下来。提供 2 人口容量。" },
        { id: "greenhouse", name: "玻璃温室", era: 5, type: "住房", tech: "dreammat", supply: { heat: 0.5 }, prod: { stone: 1.5 }, cap: 10, jobs: 1, cost: { wood: 300, stone: 200 }, disc: ["dreammat", "agri2"], desc: "玻璃底下留了一小块不发灰的绿。田里长出的活庄稼，是这个世界几十年来第一件「新事」。提供 10 人口容量。" },
        // —— 采集（建材） ——
        { id: "scavenge", name: "拾荒队", era: 1, type: "采集", tech: null, prod: { wood: 0.3, insight: 0.25 }, jobs: 2, cost: {}, disc: ["sort"], desc: "派两名队员翻褪色世界留下的边角料——梦忘了的东西，活人捡起来还能用。见效最快，一分钱不用花。" },
        { id: "salvage", name: "拆解场", era: 1, type: "采集", tech: null, prod: { wood: 0.6 }, jobs: 1, cost: { wood: 15 }, disc: ["sort", "hoard"], desc: "旧工厂回收、旧房架拆解。死人的城不缺建材，缺敢去拿的人。" },
        // —— 农业（腐土核心：粮食） ——
        { id: "farm", name: "农田", era: 1, type: "农业", tech: null, supply: { heat: 0.15 }, prod: { stone: 0.5 }, jobs: 2, cost: { wood: 20 }, disc: ["agri2"], desc: "在灰白与腐绿之间开一块田。粮食是活人的证明——田在长，说明这里还有人认真活着。" },
        { id: "farm2", name: "大田垄", era: 2, type: "农业", tech: "survey", supply: { heat: 0.3 }, prod: { stone: 1.2 }, jobs: 3, cost: { wood: 80, stone: 60 }, disc: ["survey", "agri2"], desc: "方正、规整、垄是垄沟是沟。越像人类的田，梦越认——产量就是信念给的和。" },
        { id: "irrigation", name: "灌溉渠", era: 3, type: "农业", tech: null, supply: { heat: 0.4 }, prod: { stone: 2.0 }, jobs: 3, cost: { wood: 120, stone: 150 }, disc: ["agri2"], desc: "水渠笔直地穿过田垄。荒野在熄灭，田在长亮——每多一垄绿，褪色就停一分。" },
        // —— 加工（灯油产线） ——
        { id: "lamphouse", name: "油灯工坊", era: 2, type: "加工", tech: "anchor", recipe: { wood: 1.0 }, prod: { heat: 2.0 }, jobs: 1, cost: { wood: 80, stone: 40 }, disc: ["fire", "anchor2"], desc: "把建材闷成烧得更久的灯油。锚不能停——回廊那盏灯不灭，靠的就是这些东西。" },
        { id: "energytower", name: "长明灯塔", era: 6, type: "加工", tech: "beacon", prod: { heat: 30 }, jobs: 2, cost: { wood: 1200, stone: 800 }, disc: ["fire", "anchor2"], desc: "把整座城的相信聚成一点。点亮它的那晚，十里外的灰都退了三步。" },
        // —— 信念（人类相信自己——产出信念） ——
        { id: "marker", name: "界碑", era: 1, type: "信念", tech: null, prod: { insight: 0.2 }, jobs: 0, cost: { wood: 25 }, disc: ["spirit"], desc: "立碑=宣示主权。碑上刻着城的名字，梦听见有人喊它，就开始把它当真。" },
        { id: "wall", name: "城墙", era: 1, type: "信念", tech: null, prod: { insight: 0.3 }, jobs: 0, cost: { wood: 40 }, disc: ["dreammat", "spirit"], desc: "你越相信一座墙立得住，它就越立得住。在梦里，方正严整的墙比钢铁还硬。" },
        { id: "stonewall", name: "石墙", era: 3, type: "信念", tech: "dreammat", prod: { insight: 0.8 }, jobs: 0, cost: { stone: 150, wood: 100 }, disc: ["dreammat", "spirit"], desc: "骄傲，固化成石头。被人类开垦过的土地，褪色会停下来。" },
        { id: "council", name: "议事堂", era: 3, type: "信念", tech: null, prod: { insight: 1.0 }, jobs: 2, cost: { wood: 150, stone: 100 }, disc: ["spirit"], desc: "每晚点灯议事：今天的活、明天的田、回家的路。记得任务的人，才是清醒的人。" },
        { id: "monument", name: "纪念碑", era: 5, type: "信念", tech: "dreammat", eff: 0.10, prod: { insight: 2 }, jobs: 0, cost: { stone: 600, wood: 400 }, disc: ["dreammat", "spirit"], desc: "碑上不写颂词，只写城的名字和第一批人的名字。战死者和累死者刻进同一堵墙——名字可以刻进亲手砌的墙，人就没有真的走。全城产出 +10%。" },
        // —— 仓储 ——
        { id: "woodshed", name: "建材棚", era: 1, type: "仓储", tech: null, store: { wood: 250 }, cost: { wood: 35 }, desc: "风雨再大，棚里的料也是干的。建材上限 +250。" },
        { id: "granary", name: "粮仓", era: 1, type: "仓储", tech: null, store: { stone: 300 }, cost: { wood: 35 }, desc: "存粮就是存底气。粮仓堆满的那天，连梦都闻得见烟火气。粮食上限 +300。" },
        { id: "storehouse", name: "物资总库", era: 4, type: "仓储", tech: null, store: { "*": 2000 }, cost: { wood: 250, stone: 200 }, desc: "分类、码放、登记在册——人类的秩序，连仓库都不例外。所有物资上限 +2000。" },
        // —— 军事（防守无判定；兵只做出征收复可开垦土地） ——
        { id: "barracks", name: "武装哨所", era: 1, type: "军事", tech: "deploy", milCap: 4, supply: { heat: 0.1 }, cost: { wood: 60 }, disc: ["deploy"], desc: "围墙、哨位、门口一把斧头。军队容量 +4，兵从生还者里转职。" },
        { id: "armory", name: "军械库", era: 2, type: "军事", tech: "guncraft", effMil: 0.10, supply: { heat: 0.3 }, jobs: 1, cost: { wood: 100, stone: 60 }, disc: ["guncraft"], desc: "刀要磨，矛要养。开荒从来是两件事：建设，和战斗。全军战力 +10%。" },
        { id: "watchtower", name: "瞭望台", era: 3, type: "军事", tech: "scouting", timeCut: 0.15, supply: { heat: 0.3 }, jobs: 1, cost: { wood: 150, stone: 100 }, disc: ["scouting"], desc: "站得高，看得远——永远两人同行，这是开垦队的规矩。出征耗时 -15%。" },
        { id: "fortress", name: "要塞", era: 4, type: "军事", tech: "drill", milCap: 15, effMil: 0.15, supply: { heat: 0.5 }, jobs: 2, cost: { wood: 300, stone: 250 }, disc: ["drill"], desc: "墙里的人守着墙外的路。军队容量 +15，全军战力 +15%。" },
        // —— 功能 ——
        { id: "launchpad", name: "回廊之门", era: 6, type: "功能", tech: "jump", supply: { heat: 2.0 }, eg: 0.10, jobs: 4, cost: { stone: 2500, wood: 2500 }, disc: ["jump"], desc: "城中心亮起来的那一扇门。回廊两侧的门排到看不见的那头——一次只能推开一扇，推开了这扇，才有资格走到下一扇门前。" },
    ];

    // 科技：研究=花资源一次性购买。kind: unlock(解锁新建筑) boost(永久效率) mil(军事)
    // 叙事：研究的是"这个世界不一样的地方"——梦的规则怎么为人类所用。
    const T = {
        // —— 解锁型 ——
        anchor:      { name: "锚定学",     era: 2, kind: "unlock", price: { insight: 60, wood: 40 },    pre: null,       req: null,       desc: "确认锚的运转原理：清醒可以广播给全队，锚要烧灯油。解锁油灯工坊——灯油产线成体系。" },
        survey:      { name: "土壤勘察",   era: 2, kind: "unlock", price: { insight: 80, stone: 60 },   pre: null,       req: null,       desc: "查清腐土的脾气：哪块地肯长庄稼，哪块地长出来的东西不能吃。解锁大田垄。" },
        dreammat:    { name: "梦质材料学", era: 3, kind: "unlock", price: { insight: 450, stone: 150 }, pre: "survey",   req: null,       desc: "本地石头在梦里也认账——只要足够多的人相信它承得住。解锁石墙与玻璃温室；纪念碑的前提。" },
        jump:        { name: "回廊定位",   era: 6, kind: "unlock", price: { insight: 90000, wood: 1500, stone: 1500 }, pre: null, req: null, desc: "定位下一扇门在哪里。路不必一步一步走完——但门要一扇一扇开。解锁回廊之门。" },
        beacon:      { name: "灯塔工程",   era: 6, kind: "unlock", price: { insight: 60000, stone: 1200 }, pre: null,     req: null,       desc: "把整座城的相信聚成一点。解锁长明灯塔。" },
        // —— 效率型（对梦的规则理解越深，产出越高） ——
        fire:        { name: "灯火苏醒",   era: 1, kind: "boost", price: { insight: 10 },                pre: null,       req: null, boost: { heat: 0.25 }, desc: "确认了规则：每一个活着的居民都在为锚供灯油——梦开始认账，居民从此用灯。" },
        sort:        { name: "分拣规程",   era: 1, kind: "boost", price: { insight: 25 },                pre: null,       req: null, boost: { wood: 0.40 }, desc: "把拆解流程编成手册。对褪色世界的建材理解越深，同一堆废料出得越多。" },
        data:        { name: "采样规程",   era: 2, kind: "boost", price: { insight: 150, wood: 40 },     pre: null,       req: null, boost: { insight: 0.40 }, desc: "信念不是玄学，是可以记录复现的手艺。规程越标准，信念产得越稳。" },
        agri2:       { name: "轮作休耕",   era: 3, kind: "boost", price: { insight: 600, stone: 100 },   pre: null,       req: null, boost: { stone: 0.50 }, desc: "田也要做梦。让地按人类的作息轮作——产量反而高过任何一个死掉的世界的丰年。" },
        anchor2:     { name: "灯火共鸣",   era: 3, kind: "boost", price: { insight: 900, stone: 100 },   pre: "fire",     req: null, boost: { heat: 0.50 }, desc: "灯火与灯火之间会呼应。城里的人越相信彼此，每一分光就越亮。" },
        hoard:       { name: "深度拆解",   era: 3, kind: "boost", price: { insight: 900, wood: 300 },    pre: "sort",     req: null, boost: { wood: 0.60 }, desc: "连灰渣都过一遍手。这座城留下的东西比所有人以为的多。" },
        spirit:      { name: "信念工程",   era: 4, kind: "boost", price: { insight: 5000, stone: 200 },  pre: "data",     req: null, boost: { insight: 0.50 }, desc: "信念可以设计：越规整、越有名字、越有用途的东西，梦给的力量越大。城开始按图纸长。" },
        // —— 军事线（兵只做出征开垦） ——
        deploy:      { name: "防御部署",   era: 1, kind: "mil", price: { insight: 15 },                   pre: null,       req: null, mil: true, desc: "开荒条例第一节：先立围墙，再立条令。解锁武装哨所与持盾者。" },
        guncraft:    { name: "矛刃维护",   era: 2, kind: "mil", price: { insight: 120, wood: 60 },        pre: "deploy",   req: "barracks", mil: true, desc: "一手工具一手武器——工具要保养，武器更要。解锁军械库与长矛手。" },
        scouting:    { name: "斥候编队",   era: 3, kind: "mil", price: { insight: 400, wood: 80 },        pre: "guncraft", req: null, mil: true, desc: "永远两人同行：任何没被灯照过的地方，单人不许进。解锁瞭望台，出征耗时 -15%。" },
        drill:       { name: "战术操典",   era: 4, kind: "mil", price: { insight: 4000, stone: 150 },     pre: "scouting", req: null, mil: true, desc: "把活着回来写成条目，再把条目推演一遍。解锁要塞。" },
        occupation:  { name: "永久驻防",   era: 5, kind: "mil", price: { insight: 25000, stone: 400 },    pre: "drill",    req: null, mil: true, desc: "开了垦就不走了。全部可开垦土地产出 +25%。" },
        waketrain:   { name: "清醒者训练", era: 5, kind: "mil", price: { insight: 40000, stone: 400 },    pre: "drill",    req: "armory", mil: true, desc: "清醒不是天赋，是手艺——手艺可以传。解锁清醒者：全队信念产出+，死亡不消失（只是忘了）。" },
    };

    // 兵种：一手工具一手武器（建设与战斗是同一件事的两面）
    const ARMY = [
        { id: "shield",  name: "持盾者",   era: 1, tech: "deploy",    pow: 5,   cost: { wood: 30 },             upkeep: 0.05, desc: "城墙防守核心。盾墙立起来的时候，梦里就多了一条铁律。" },
        { id: "spear",   name: "长矛手",   era: 2, tech: "guncraft",  pow: 12,  cost: { wood: 40 },             upkeep: 0.05, desc: "对腐绿之城里的「东西」特攻。它们不恨你，只是会走过来——矛尖教会它们别过来。" },
        { id: "bow",     name: "弓手",     era: 3, tech: "scouting",  pow: 35,  cost: { wood: 60, stone: 40 },  upkeep: 0.05, desc: "远程压制。隔着三十步解决，比近身体面得多。" },
        { id: "waker",   name: "清醒者",   era: 5, tech: "waketrain", pow: 120, cost: { insight: 150 },         upkeep: 0.05, desc: "全队信念产出+，死亡不消失——只是忘了些现实，而他的墙还在。" },
    ];

    // 可开垦土地：6 块（腐土收复条件=农田覆盖全部 6 块，世界停止褪色）
    const NODES = [
        { id: "n1", zone: 1, name: "荒村田垄",   garrison: 10,   time: 30,   foe: "十几具游荡的东西",            loot: { wood: 50 },                   gain: { pct: { wood: 0.20 } },      desc: "荒村外最后一垄没褪完的土。开垦它，田就多一分绿。" },
        { id: "n2", zone: 1, name: "旧城苗圃",   garrison: 30,   time: 60,   foe: "苗房里挤成一团的灰群",        loot: { stone: 60 },                  gain: { pct: { stone: 0.20 } },     desc: "苗床还在，种子罐没开封——这个世界欠自己的春天，从这里还起。" },
        { id: "n3", zone: 1, name: "街心花园",   garrison: 60,   time: 120,  foe: "守着花坛不动的站桩死者",      loot: { insight: 80 },                gain: { pct: { insight: 0.20 } },   desc: "花全灰了，花坛的形状还在。人类在乎秩序——花园的形状本身就是一笔信念。" },
        { id: "n4", zone: 2, name: "河湾平地",   garrison: 200,  time: 420,  foe: "水边成列的影子",              loot: { stone: 200 },                 gain: { pct: { stone: 0.25 } },     desc: "河还没褪色，湾里的土是湿的。开垦队的眼睛都亮了。" },
        { id: "n5", zone: 2, name: "陡坡梯田",   garrison: 400,  time: 800,  foe: "田埂间穿行的整编灰潮",        loot: { wood: 300 },                  gain: { pct: { wood: 0.30 } },      desc: "上一个文明在这里种过地。梯田的轮廓还没塌——把他们的垄接着种下去。" },
        { id: "n6", zone: 3, name: "腐土腹地",   garrison: 800,  time: 1600, foe: "最深处——数不清的东西",       loot: { insight: 2000 },              gain: { global: 0.20 },             desc: "颜色褪得最快的地方，也是这个世界最先熄灭的地方。第六块地开垦完，这片土地就再也暗不下去了。" },
    ];

    // 营地称号（按人口）
    const CAMP_TIERS = [
        { min: 0, name: "无人营地" },
        { min: 1, name: "第一炉火", flavor: "火堆边终于有了颜色。" },
        { min: 10, name: "小围城", flavor: "十几个人，一圈界碑，也算个地方了。" },
        { min: 25, name: "围城", flavor: "围起来的，是人心里的一点底气。" },
        { min: 50, name: "垦区", flavor: "路是踩出来的，田是开出来的。" },
        { min: 100, name: "大垦区", flavor: "孩子们在灯下追跑，不再问天为什么灰。" },
        { min: 200, name: "灯城", flavor: "有街有市，有灯有钟。梦开始把它当成一个名字记住。" },
        { min: 400, name: "绿洲", flavor: "腐土没能拦住它长出颜色。" },
        { min: 800, name: "腐土之心", flavor: "它立在这里，像一句回答。" },
    ];

    const BM = {}; B.forEach(b => (BM[b.id] = b));
    const AM = {}; ARMY.forEach(a => (AM[a.id] = a));
    const NM = {}; NODES.forEach(n => (NM[n.id] = n));

    const WORLDS = [
        { id: "w1", name: "腐土 · 第一扇门", short: "腐土" },
        { id: "w2", name: "血旗 · 第二扇门", short: "血旗" },
        { id: "w3", name: "渊巢 · 第三扇门", short: "渊巢" },
        { id: "w4", name: "千母 · 第四扇门", short: "千母" },
    ];

    // 回廊记事：随荣光进度逐段解锁——逐步揭露这个门末日的起因、过程与答案。
    // ratio: 解锁所需的荣光进度（0~1，基于本局累计灯油/换门阈值）
    const STORY = [
        { ratio: 0, title: "门后的第一眼", text: "推开门的时候，风是灰的。天光像蒙了一层旧玻璃，分不清是阴天还是黄昏。城郭就在远处铺开——楼是完整的，路是完整的，只是所有颜色都被抽走了。带队的清醒者说了一句话，后来刻在了第一炉火的炉边上：这里死过，但没埋。" },
        { ratio: 0.10, title: "灰从边缘来", text: "侦察队往城外走了三天，带回来的报告只有一句话：颜色是从边缘开始褪的。像一张被水泡过的照片——先褪的是血色，然后是草色，最后连影子都变成了灰的。没有人知道褪色从哪一天开始。世界自己大概也不知道。" },
        { ratio: 0.25, title: "第一个消失的颜色", text: "农人在旧苗圃翻出一份记录，纸上的字迹很稳：『今年花没有开。不是枯了——是没开。』落款日期之后还有七页，页页都在记同一件事。褪色不是灾害，是一种秩序：先是不能生长，然后是不能改变，最后是不能记得。这个世界的死法，是从『不能再有新事』开始的。" },
        { ratio: 0.40, title: "城里的人去哪了", text: "旧城的人口登记册躺在市政厅的地窖里，最后一页写着：『居民迁往南方，据称那里还有颜色。』侦察队沿着『南方』找了很久。没有南方。他们只是走进了灰里——不是死了，是变得和世界一样：不老，不动，不记得自己要去做什么。这片平原上走着的东西，曾经都是等春天的人。" },
        { ratio: 0.55, title: "旧文明的最后广播", text: "广播塔的备用电源到今天还有一格电。磁带里是一个疲惫的声音：『不要试图唤醒任何人。他们醒着，但不再相信任何事——这才是问题所在。如果你听到这段话，去做点什么。种一亩田也好。让世界看见一件新事。』我们不知道广播的人最后去了哪。但开垦队的手册第一页，印的就是这段话。" },
        { ratio: 0.70, title: "褪色的原因", text: "清醒者们把所有的线索拼在一起，得出一个安静的结论：梦是有寿命的，寿命长不过『还有人相信它』。这座城曾经被几十万人相信过——他们相信春天会来，相信庄稼会活，相信明天和今天不一样。后来相信的人一个一个变灰，梦就没了燃料。腐土不是被杀死的。它只是被忘记了。" },
        { ratio: 0.85, title: "梦的深处", text: "夜里守灯的人说，灯油烧到最旺的时候，能听见很深的地方有心跳。不是这个世界的心跳——是更底下，所有梦共用的那一个。沉睡者还没有醒。它在梦里养着这些世界，像一个人在睡眠里养自己的旧念头。念头不会永远活着。但念头可以被新的故事替换。我们盖的每一座城，都是一个新故事。" },
        { ratio: 1.0, title: "荣光", text: "第六块地开垦完的那天，田里的绿连成了片。褪色停了——旧文明的记录里管这叫『不可能』。但梦听得见人相信什么：几十个人相信一块田能活，田就真的活了。这个世界不会再无声无息地灭掉，因为我们来过了。碑上刻好名字，灯油收进锚里。下一扇门在走廊的深处等着——人类先到。" },
    ];

    return { RES, RES_NAME, ERAS, B, T, BM, WORLDS, CAMP_TIERS, ARMY, AM, NODES, NM, STORY, NODE_ZONES: ["腐土边缘", "腐土腹地", "腐土深处"] };
})();
