import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const defaults: Array<{
    slot: "OJA" | "YAJA" | "SIMJA";
    startTime: string;
    endTime: string;
    lateThresholdMinutes: number | null;
  }> = [
    { slot: "OJA", startTime: "07:40", endTime: "08:20", lateThresholdMinutes: 10 },
    { slot: "YAJA", startTime: "19:00", endTime: "21:00", lateThresholdMinutes: 10 },
    { slot: "SIMJA", startTime: "21:10", endTime: "22:40", lateThresholdMinutes: 10 },
  ];

  for (const s of defaults) {
    await prisma.slotConfig.upsert({
      where: { slot: s.slot },
      update: {},
      create: { ...s, active: true },
    });
  }

  console.log("Seed complete: SlotConfig x3");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
