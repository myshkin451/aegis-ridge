import type { MepKind, MepNetwork } from './mepNetworkSchema'
import type { SiteKind } from './siteFacilities'

export interface CrewMember {
  id: string
  name: string
  role: string
  primary: string
  support: readonly [string, string]
  partners: readonly [string, string]
  bedroomId: string
  bedIndex: number
  roomIds: string[]
  sites: SiteKind[]
  network: { station?: MepKind[]; branches?: MepKind[] }
  route: { roomId: string; caption: string; anchor?: number }[]
}

// Bed indices identify physical beds within a cabin. On-call bunks stay available for relief staff.
export const crew: CrewMember[] = [
  {
    id: 'structure', name: '林岳', role: '总架构与地质结构师', primary: '建筑结构与岩体防护',
    support: ['重载机械', '外围安保与平硐'], partners: ['mechanical', 'instrumentation'],
    bedroomId: 'b2-single-1', bedIndex: 0, roomIds: ['b4_drainage', 'l1_vestibule', 'b1_tactical'],
    sites: ['gallery', 'westPortal', 'eastBore'], network: { station: ['structure'], branches: ['drain'] },
    route: [
      { roomId: 'b1_tactical', caption: '核对昨夜外业记录及待送检的地质样本。' },
      { roomId: 'b4_drainage', caption: '在集水间对照昨夜水位记录，查看集水坑周边的渗水痕迹。' },
    ],
  },
  {
    id: 'energy', name: '苏岚', role: '微核能与热力学专家', primary: '微核能与热平衡',
    support: ['强电配电', '地源热泵与热信号掩护'], partners: ['electrical', 'water'],
    bedroomId: 'b2-single-2', bedIndex: 0, roomIds: ['b4_reactor', 'b4_geothermal'],
    sites: [], network: { station: ['heat'], branches: ['power'] },
    route: [
      { roomId: 'b4_reactor', caption: '交班前抄录主机出力与当班用电负荷。' },
      { roomId: 'b4_geothermal', caption: '核对热泵供回水温度，把未消纳的热量写入值班记录。' },
    ],
  },
  {
    id: 'electrical', name: '陈墨', role: '强电与储能总工', primary: '双母线强电与固态储能',
    support: ['弱电智控', '电子维修'], partners: ['instrumentation', 'mechanical'],
    bedroomId: 'b2-single-3', bedIndex: 0, roomIds: ['b4_switchgear', 'b1_workshop'],
    sites: ['solar'], network: { station: ['power'] },
    route: [
      { roomId: 'b4_switchgear', caption: '对照 A、B 两段母线读数，记录储能柜的充放电状态。' },
      { roomId: 'b1_workshop', anchor: 1, caption: '和机械师交接待修电控板，核对工作台上的备件。' },
    ],
  },
  {
    id: 'instrumentation', name: '陆知行', role: '智控、通讯与周界算法师', primary: '弱电网络与态势自动化',
    support: ['地震检波周界', '邻峰雷达通讯'], partners: ['structure', 'electrical'],
    bedroomId: 'b2-single-4', bedIndex: 0, roomIds: ['b2_command', 'l2_observatory', 'b1_tactical'],
    sites: ['relay', 'sensors'], network: { station: ['data'] },
    route: [
      { roomId: 'b2_command', caption: '核验气象与水文遥测的时间戳，签录夜班漏报。' },
      { roomId: 'b1_tactical', caption: '在仪器架核对外业记录器编号与下一班电池。' },
    ],
  },
  {
    id: 'mechanical', name: '周明远', role: '精密制造与大修机械师', primary: 'CNC、增材制造与大修',
    support: ['重载吊装与索道', '管道焊接'], partners: ['logistics', 'water'],
    bedroomId: 'b2-single-5', bedIndex: 0, roomIds: ['b1_workshop', 'b1_logistics', 'l1_garage'],
    sites: ['cable'], network: { station: ['freight'], branches: ['power'] },
    route: [
      { roomId: 'b1_logistics', caption: '在充电位旁核对待运件和早班搬运单。' },
      { roomId: 'b1_workshop', caption: '沿共用走廊抵达工坊，查看加工中心的维修记录。' },
    ],
  },
  {
    id: 'agronomy', name: '顾清禾', role: '立体农艺与生态工程师', primary: '分层水培与主粮光照',
    support: ['鱼菜与菌菇养殖', '食品加工'], partners: ['water', 'nutrition'],
    bedroomId: 'b2-single-6', bedIndex: 0, roomIds: ['b3_hydroponics', 'b3_aquaponics', 'l2_greenhouse'],
    sites: [], network: { branches: ['supply', 'drain', 'power'] },
    route: [
      { roomId: 'b3_hydroponics', caption: '沿种植架查看叶面与照明时段，登记需要补苗的层位。' },
      { roomId: 'b3_aquaponics', caption: '在鱼池巡视回水和根区，再与厨房核对本日采收量。' },
    ],
  },
  {
    id: 'water', name: '沈星野', role: '水循环与三防环境总工', primary: '闭环净水、电解制氧与三防新风',
    support: ['洗消气闸', '地热管网'], partners: ['medical', 'energy'],
    bedroomId: 'b2-double-1', bedIndex: 0, roomIds: ['b3_water', 'b4_cbrn_hvac', 'b1_decon'],
    sites: ['spring', 'drain'], network: { station: ['supply', 'drain', 'vacuum', 'airReturn', 'airSupply'] },
    route: [
      { roomId: 'b3_water', caption: '对照两列净水设备的运行记录，留存当班水样。' },
      { roomId: 'b4_cbrn_hvac', caption: '记录风机与送风的值班读数，再交给医务组复核。' },
      { roomId: 'b1_decon', anchor: 1, caption: '到洗消间门旁，核对压差表与上一班记录。' },
    ],
  },
  {
    id: 'medical', name: '许安然', role: '主治医师与生化防护专家', primary: '临床医疗与生化检测',
    support: ['心理光疗康复', '水质检验'], partners: ['nutrition', 'water'],
    bedroomId: 'b2-double-1', bedIndex: 1, roomIds: ['b2_medical', 'b1_gym'],
    sites: [], network: { branches: ['airReturn', 'airSupply', 'supply'] },
    route: [
      { roomId: 'b2_medical', caption: '核对留样标签、值班记录与当日预约。' },
      { roomId: 'b1_gym', caption: '在康复区查看光疗灯和器材，准备上午的预约。' },
    ],
  },
  {
    id: 'logistics', name: '江彻', role: '材料学与供应链主管', primary: '立体仓储与材料再生',
    support: ['战略冷库', '机械加工'], partners: ['nutrition', 'mechanical'],
    bedroomId: 'b2-double-2', bedIndex: 0, roomIds: ['b1_warehouse', 'b3_coldvault', 'b1_logistics'],
    sites: [], network: { station: ['freight'], branches: ['data'] },
    route: [
      { roomId: 'b1_warehouse', caption: '逐架核对昨夜领用的备件与周转箱。' },
      { roomId: 'b3_coldvault', caption: '查看库温记录和当日出库批次，签收库存交接。' },
    ],
  },
  {
    id: 'nutrition', name: '温言', role: '营养、后勤与档案总管', primary: '食品加工与营养配餐',
    support: ['菌菇养殖', '图书馆与社区节律'], partners: ['agronomy', 'medical'],
    bedroomId: 'b2-double-2', bedIndex: 1, roomIds: ['b2_commons', 'b2_library', 'b3_foodproc'],
    sites: [], network: { branches: ['supply', 'drain', 'power'] },
    route: [
      { roomId: 'b2_commons', caption: '在餐厅核对早班用餐人数和当天食材。' },
      { roomId: 'b2_library', caption: '将各组签过的交班记录归入当天档案。' },
      { roomId: 'b3_foodproc', caption: '在处理台对照采收批次，登记本日菜单。' },
    ],
  },
]

export const crewById = new Map(crew.map((member) => [member.id, member]))
export function responsibilityEdges(member: CrewMember, network: MepNetwork) {
  const terminals = new Set(network.nodes.filter((n) => n.roomId && member.roomIds.includes(n.roomId)).map((n) => n.id))
  return network.edges.filter((edge) => member.network.station?.includes(edge.kind) ||
    (member.network.branches?.includes(edge.kind) && (terminals.has(edge.from) || terminals.has(edge.to)))
  ).map((edge) => edge.id)
}
