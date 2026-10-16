// Uji empiris settingsSchema: apakah parse() menambah field yang tidak dikirim?
import { settingsSchema } from "@/lib/validation";

const b1 = settingsSchema.parse({ logoUrl: null });
console.log("keys dari {logoUrl:null}          :", Object.keys(b1));

const b2 = settingsSchema.parse({ whatsappTemplate: "tes" });
console.log("keys dari {whatsappTemplate}      :", Object.keys(b2));

const b3 = settingsSchema.parse({ phone: "628123456000" });
console.log("keys dari {phone:628...}          :", Object.keys(b3));

console.log("nilai b1 lengkap:", JSON.stringify(b1));
console.log("nilai b3 lengkap:", JSON.stringify(b3));
