import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const defaults: Array<{
    slot: "YAJA1" | "YAJA2" | "SIMJA";
    startTime: string;
    endTime: string;
    lateThresholdMinutes: number | null;
  }> = [
    { slot: "YAJA1", startTime: "19:00", endTime: "20:30", lateThresholdMinutes: 10 },
    { slot: "YAJA2", startTime: "20:40", endTime: "22:00", lateThresholdMinutes: 10 },
    { slot: "SIMJA", startTime: "22:10", endTime: "23:30", lateThresholdMinutes: 10 },
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
