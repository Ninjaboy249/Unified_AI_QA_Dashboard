import type { DirectoryRecord } from "../types.js";

const recordsCounter = counter();

const accessories = {
  anjna: "Type 3 Cable; Cable with Adapter",
  avinash: "Type C: 3 Cable; Lightning: 1; Adaptor: 1",
  ashutosh: "Type C: 1 Cable; Lightning: 1; Adaptor: 1",
  utkarsh: "1 Android Type C cable with Android adaptor; 1 iPhone Type C cable with Android adaptor",
  shivam: "1 Android Type C cable with Android adaptor",
  akash: "1 Android Type C cable with Android adaptor; 1 iPhone Type C cable; 1 iPhone Lightning cable with iOS adaptor",
  srishti: "Inventory pending"
};

const records: DirectoryRecord[] = [
  active(1, "Anjna", "Google Pixel 8 A", "17", "17", "43011JEKB21362", accessories.anjna),
  active(1, "Anjna", "iPhone 14 Plus", "27", "27", "X3GD7NTXV1", accessories.anjna),
  active(2, "Avinash Kumar", "Samsung S24", "17", "17", "RZCX709CWQL", accessories.avinash),
  active(2, "Avinash Kumar", "OnePlus 12", "15", "15", "1D5DAFBD", accessories.avinash),
  active(2, "Avinash Kumar", "iPhone 13", "26", "27.0.1", "MYQR4L499H", accessories.avinash),
  active(2, "Avinash Kumar", "iPad Pro", "17", "17.7.1", "DMPF6C7DPV03", accessories.avinash),
  active(3, "Ashutosh Pandey", "Samsung Flip5", "16", "16", "RZCW81GD7TE", accessories.ashutosh),
  active(3, "Ashutosh Pandey", "Samsung Tab S9", "16", "16", "R52X705GXLJ", accessories.ashutosh),
  active(3, "Ashutosh Pandey", "iPhone 14", "26", "27.0.1", "WV6VQXXLYK", accessories.ashutosh),
  active(3, "Ashutosh Pandey", "iPhone 12", "26", "26.5.2", "GV4F80K30F11", accessories.ashutosh),
  active(3, "Ashutosh Pandey", "iPhone XR", "18", "18.7.9", "GV4DHOFF9KXK7", accessories.ashutosh),
  active(4, "Utkarsh", "Samsung S25", "17", "17", "RZGYCOPKB5R", accessories.utkarsh),
  active(4, "Utkarsh", "Samsung Note 10", "12", "12", "RZ8M81Q6QNB", accessories.utkarsh),
  active(4, "Utkarsh", "iPhone 15", "27", "27", "DRYYCWJMGV", accessories.utkarsh),
  active(4, "Utkarsh", "iPhone 17", "26", "26.7.1", "M4XYM27PRG", accessories.utkarsh),
  active(5, "Shivam", "Samsung S24 ultra", "17", "17", "RZCX70SVBPA", accessories.shivam),
  active(5, "Shivam", "Vivo Y31", "13", "13", "96336931970020N", accessories.shivam),
  active(5, "Shivam", "Samsung A50s", "11", "11", "RZ8M847FGCP", accessories.shivam),
  active(5, "Shivam", "iPhone 15", "27", "27", "C9VYGF5FPD", accessories.shivam),
  active(5, "Shivam", "iPhone 12", "26", "26.5.2", "GV4G90DM0F0V", accessories.shivam),
  active(5, "Shivam", "iPhone 11 (Shared Device)", "18", "18.7.8", "GV4FK057N738", accessories.shivam),
  active(6, "Akash Verma", "Google Pixel 8", "17", "17", "39211FDJH00LFX", accessories.akash),
  active(6, "Akash Verma", "OnePlus 12", "16", "16", "7345cf88", accessories.akash),
  active(6, "Akash Verma", "iPhone 15 Pro Max", "27.0.1", "27.0.1", "DN9YNRLWM1", accessories.akash),
  active(6, "Akash Verma", "iPhone XR", "18.7.10", "18.7.10", "GV4D80QXKXK5", accessories.akash),
  active(7, "Srishti", "Google Pixel 9A", "17", "17", "62241XEBF0A5FE", accessories.srishti),
  active(7, "Srishti", "Samsung Galaxy Tab S9 FE+", "16", "16", "R52X60CTA6V", accessories.srishti),
  active(7, "Srishti", "iPhone 15 Pro Max", "26", "26.6", "HFYF6GYY90", accessories.srishti),
  active(7, "Srishti", "iPad Mini", "26", "26.6", "H2JJVF9M2P", accessories.srishti),
  obsolete("Ashutosh Pandey", "iPhone X", "16", "16.7.11", "F17VWPGUJCLF"),
  obsolete("Ashutosh Pandey", "iPhone 11", "26", "26.5", "GV4FK02LN738"),
  obsolete("Ashutosh Pandey", "Samsung F41", "12", "12", "Unassigned"),
  obsolete("Srishti", "iPhone 12", "Unknown", "Unknown", "Unassigned")
];

export function searchDirectory(query: string): DirectoryRecord[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return records;
  return records.filter((record) => Object.values(record).join(" ").toLowerCase().includes(normalized));
}

function active(
  serialGroup: number,
  owner: string,
  device: string,
  os: string,
  completeOsVersion: string,
  serialNo: string,
  accessoryList: string
): DirectoryRecord {
  return makeRecord(serialGroup, owner, device, os, completeOsVersion, serialNo, accessoryList, "Active");
}

function obsolete(owner: string, device: string, os: string, completeOsVersion: string, serialNo: string): DirectoryRecord {
  return makeRecord(0, owner, device, os, completeOsVersion, serialNo, "Retired inventory", "Obsolete");
}

function makeRecord(
  serialGroup: number,
  owner: string,
  device: string,
  os: string,
  completeOsVersion: string,
  serialNo: string,
  accessoryList: string,
  status: DirectoryRecord["status"]
): DirectoryRecord {
  const idPrefix = status === "Active" ? "DEV" : "OBS";
  const id = `${idPrefix}-${String(recordsCounter.next().value).padStart(3, "0")}`;
  return {
    id,
    serialGroup,
    owner,
    device,
    os,
    completeOsVersion,
    serialNo,
    accessories: accessoryList,
    platform: detectPlatform(device),
    status,
    notes: status === "Active" ? "Available for QA validation and release testing." : "Retired or obsolete device."
  };
}

function detectPlatform(device: string): DirectoryRecord["platform"] {
  const value = device.toLowerCase();
  if (value.includes("ipad")) return "iPadOS";
  if (value.includes("iphone")) return "iOS";
  if (value.includes("samsung") || value.includes("pixel") || value.includes("oneplus") || value.includes("vivo")) return "Android";
  return "Unknown";
}

function* counter() {
  let value = 1;
  while (true) yield value++;
}
