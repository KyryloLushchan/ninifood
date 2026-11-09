/** Банковские приложения с deeplink VietQR. Снимок официальных API https://api.vietqr.io/v2/android-app-deeplinks и /v2/ios-app-deeplinks (2026-11).
 *  fill: приложение само подставляет счёт и сумму (autofill=1); иначе только открывается (сумму и счёт вводят вручную или по сохранённому QR). ios=false — только Android. */
export interface BankApp { id: string; name: string; fill: boolean; ios: boolean }

/** Первые в списке (по умолчанию), дальше — по популярности из API. */
export const BANK_APPS: BankApp[] = [
  { id: "vcb", name: "VCB Digibank", fill: false, ios: true },
  { id: "mb", name: "MB Bank", fill: true, ios: true },
  { id: "tcb", name: "Techcombank Mobile", fill: false, ios: true },
  { id: "bidv", name: "BIDV SmartBanking", fill: true, ios: true },
  { id: "vpb", name: "VPBank NEO", fill: false, ios: true },
  { id: "tpb", name: "TPBank Mobile", fill: false, ios: true },
  { id: "acb", name: "ACB ONE", fill: true, ios: true },
  { id: "icb", name: "VietinBank iPay", fill: true, ios: true },
  { id: "vba", name: "Agribank Plus", fill: false, ios: true },
  { id: "cake", name: "CAKE - Ng\u00e2n h\u00e0ng s\u1ed1", fill: false, ios: true },
  { id: "ocb", name: "OCB OMNI", fill: true, ios: true },
  { id: "lpb", name: "LPBank", fill: false, ios: true },
  { id: "timo", name: "Timo - Ng\u00e2n h\u00e0ng s\u1ed1 by BVBank", fill: false, ios: true },
  { id: "vib-2", name: "MyVIB", fill: false, ios: true },
  { id: "hdb", name: "HDBank", fill: false, ios: true },
  { id: "vib", name: "MyVIB", fill: false, ios: false },
  { id: "shb", name: "SHB SAHA", fill: false, ios: true },
  { id: "seab", name: "SeAMobile", fill: false, ios: true },
  { id: "shbvn", name: "Shinhan SOL Vi\u1ec7t Nam", fill: false, ios: true },
  { id: "scb", name: "SCB Mobile Banking", fill: false, ios: true },
  { id: "nab", name: "Nam A Bank Open Banking", fill: false, ios: false },
  { id: "abb", name: "ABBank", fill: false, ios: true },
  { id: "eib", name: "Eximbank EDigi", fill: false, ios: true },
  { id: "coopbank", name: "Co-opBank Mobile Banking", fill: false, ios: true },
  { id: "pvcb", name: "PVConnect", fill: false, ios: true },
  { id: "wvn", name: "Woori WON Vietnam", fill: false, ios: true },
  { id: "klb", name: "KienlongBank Plus", fill: false, ios: true },
  { id: "bvb", name: "BAOVIET Smart", fill: false, ios: true },
  { id: "vab", name: "Vietbank Digital Plus", fill: false, ios: true },
  { id: "ncb", name: "NCB iziMobile", fill: false, ios: true },
  { id: "acb-biz", name: "ACB ONE Biz", fill: false, ios: true },
  { id: "mbv", name: "MBV Bank", fill: false, ios: true },
  { id: "pbvn", name: "PB engage VN", fill: false, ios: true },
  { id: "sgicb", name: "SAIGONBANK Smart Banking", fill: false, ios: true },
  { id: "cimb", name: "Octo by CIMB Vietnam", fill: false, ios: true },
];

export const bankLogo = (id: string, ios: boolean) => `https://cdn.vietqr.io/bank-app-icon/${id}-${ios ? 'ios' : 'android'}.webp`;
