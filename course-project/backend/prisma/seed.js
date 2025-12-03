/*
 * If you need to initialize your database with some data, you may write a script
 * to do so here.
 */
"use strict";

const {
  PrismaClient,
  TransactionType,
  RoleType,
  PromotionType,
} = require("@prisma/client");
const bcrypt = require("bcrypt");

const prisma = new PrismaClient();

const nowMs = Date.now();
const day = 24 * 60 * 60 * 1000;
const iso = (t) => new Date(t).toISOString();

async function safeCreate(call) {
  try {
    return await call;
  } catch (e) {
    if (e.code !== "P2002") throw e;
  }
}

async function createTransaction(
  type,
  amount,
  user,
  createdBy,
  remark = "",
  eventId = null
) {
  const data = {
    type,
    amount,
    remark,
    user: { connect: { id: user.id } },
    createdBy: { connect: { id: createdBy.id } },
    processed: true,
  };

  if (eventId !== null) {
    data.eventId = eventId;
  }

  return await prisma.transaction.create({ data });
}

async function awardPointsToGuest({ event, guest, manager, amount, remark }) {
  await prisma.transaction.create({
    data: {
      type: TransactionType.event,
      amount,
      remark: remark || "Event award",
      user: { connect: { id: guest.id } },
      createdBy: { connect: { id: manager.id } },
      event: { connect: { id: event.id } },
      processed: true,
    },
  });
  await prisma.user.update({
    where: { id: guest.id },
    data: { points: { increment: amount } },
  });
  await prisma.event.update({
    where: { id: event.id },
    data: {
      pointsRemain: { decrement: amount },
      pointsAwarded: { increment: amount },
    },
  });
}

async function main() {
  const hashedPassword = await bcrypt.hash("password123", 10);

  const superuser = await prisma.user.upsert({
    where: { utorid: "superadmin" },
    update: {},
    create: {
      utorid: "superadmin",
      email: "super.admin@mail.utoronto.ca",
      name: "Super Admin",
      password: hashedPassword,
      role: RoleType.superuser,
      verified: true,
      points: 10000,
    },
  });

  const manager = await prisma.user.upsert({
    where: { utorid: "manager1" },
    update: {},
    create: {
      utorid: "manager1",
      email: "manager.one@mail.utoronto.ca",
      name: "John Manager",
      password: hashedPassword,
      role: RoleType.manager,
      verified: true,
      points: 5000,
    },
  });

  const cashier = await prisma.user.upsert({
    where: { utorid: "cashier1" },
    update: {},
    create: {
      utorid: "cashier1",
      email: "cashier.one@mail.utoronto.ca",
      name: "Main Cashier",
      password: hashedPassword,
      role: RoleType.cashier,
      verified: true,
      points: 2500,
    },
  });

  // reg users
  const student1 = await prisma.user.upsert({
    where: { utorid: "student1" },
    update: {},
    create: {
      utorid: "student1",
      email: "alex.martin@utoronto.ca",
      name: "Alex Martin",
      password: hashedPassword,
      role: RoleType.regular,
      verified: true,
      points: 1500,
    },
  });

  const student2 = await prisma.user.upsert({
    where: { utorid: "student2" },
    update: {},
    create: {
      utorid: "student2",
      email: "bob.smith@utoronto.ca",
      name: "Bob Smith",
      password: hashedPassword,
      role: RoleType.regular,
      verified: true,
      points: 900,
    },
  });

  const student3 = await prisma.user.upsert({
    where: { utorid: "student3" },
    update: {},
    create: {
      utorid: "student3",
      email: "xu.williams@utoronto.ca",
      name: "Xu Williams",
      password: hashedPassword,
      role: RoleType.regular,
      verified: true,
      points: 300,
    },
  });

  const student4 = await prisma.user.upsert({
    where: { utorid: "student4" },
    update: {},
    create: {
      utorid: "student4",
      email: "lily.cool@utoronto.ca",
      name: "Lily Cool",
      password: hashedPassword,
      role: RoleType.regular,
      verified: true,
      points: 750,
    },
  });

  const student5 = await prisma.user.upsert({
    where: { utorid: "student5" },
    update: {},
    create: {
      utorid: "student5",
      email: "emily.bob@utoronto.ca",
      name: "Emily Bob",
      password: hashedPassword,
      role: RoleType.regular,
      verified: true,
      points: 1200,
    },
  });

  const student6 = await prisma.user.upsert({
    where: { utorid: "student6" },
    update: {},
    create: {
      utorid: "student6",
      email: "frank.miller@utoronto.ca",
      name: "Frank Miller",
      password: hashedPassword,
      role: RoleType.regular,
      verified: true,
      points: 600,
    },
  });

  const student7 = await prisma.user.upsert({
    where: { utorid: "student7" },
    update: {},
    create: {
      utorid: "student7",
      email: "grace.wilson@utoronto.ca",
      name: "Grace Wilson",
      password: hashedPassword,
      role: RoleType.regular,
      verified: true,
      points: 850,
    },
  });

  const organizer = await prisma.user.upsert({
    where: { utorid: "organizer1" },
    update: {},
    create: {
      utorid: "organizer1",
      email: "organizer.one@mail.utoronto.ca",
      name: "Olivia Organizer",
      password: hashedPassword,
      role: RoleType.regular,
      verified: true,
      points: 400,
    },
  });

  const allUsers = [
    superuser,
    manager,
    cashier,
    student1,
    student2,
    student3,
    student4,
    student5,
    student6,
    student7,
    organizer,
  ];

  const eventDefs = [
    {
      name: "Welcome Week Mixer",
      description: "Kickoff social event with free food and networking.",
      location: "140 St. George Street, Toronto, ON M5S 3G6",
      start: 7,
      durH: 2,
      capacity: 80,
      pointsRemain: 1000,
      published: true,
    },
    {
      name: "Computer Science Career Fair",
      description:
        "Meet industry professionals and learn about internship opportunities.",
      location: "40 St. George Street, Room 4286, Toronto, ON M5S 2E4",
      start: 14,
      durH: 3,
      capacity: 120,
      pointsRemain: 800,
      published: true,
    },
    {
      name: "Mental Health Awareness Workshop",
      description: "Learn coping strategies and stress management techniques.",
      location: "100 St. George Street, Room 2005, Toronto, ON M5S 3G3",
      start: 10,
      durH: 1.5,
      capacity: 60,
      pointsRemain: 400,
      published: true,
    },
    {
      name: "Hackathon Kickoff",
      description:
        "Start your weekend hackathon with team formation and project brainstorming.",
      location: "130 St. George Street, Robarts Library, Toronto, ON M5S 1A5",
      start: 21,
      durH: 2,
      capacity: 100,
      pointsRemain: 600,
      published: true,
    },
    {
      name: "Resume Review Session",
      description: "Get feedback on your resume from industry experts.",
      location: "40 St. George Street, Room 4286, Toronto, ON M5S 2E4",
      start: 5,
      durH: 1,
      capacity: 40,
      pointsRemain: 300,
      published: true,
    },
    {
      name: "Alumni Networking Night",
      description: "Connect with UofT alumni working in various industries.",
      location: "21 King's College Circle, Toronto, ON M5S 1A1",
      start: 28,
      durH: 2.5,
      capacity: 150,
      pointsRemain: 1200,
      published: true,
    },
    {
      name: "Startup Pitch Competition",
      description: "Watch student startups pitch their ideas to investors.",
      location: "40 St. George Street, Room 4286, Toronto, ON M5S 2E4",
      start: 35,
      durH: 3,
      capacity: 200,
      pointsRemain: 1500,
      published: true,
    },
    {
      name: "Engineering Design Showcase",
      description:
        "View innovative engineering projects from across departments.",
      location: "35 St. George Street, Toronto, ON M5S 1A4",
      start: 42,
      durH: 4,
      capacity: 250,
      pointsRemain: 1800,
      published: true,
    },
  ];

  const events = [];
  for (const def of eventDefs) {
    const startMs = nowMs + def.start * day;
    const endMs = startMs + def.durH * 60 * 60 * 1000;
    const evt = await prisma.event.create({
      data: {
        name: def.name,
        description: def.description,
        location: def.location,
        startTime: iso(startMs),
        endTime: iso(endMs),
        published: def.published,
        capacity: def.capacity,
        pointsRemain: def.pointsRemain,
        pointsAwarded: 0,
      },
    });
    events.push(evt);
  }

  const organizersMap = [
    { eventName: "Welcome Week Mixer", users: [organizer, manager] },
    { eventName: "Computer Science Career Fair", users: [manager] },
    { eventName: "Mental Health Awareness Workshop", users: [organizer] },
    { eventName: "Hackathon Kickoff", users: [student5] },
    { eventName: "Resume Review Session", users: [manager, organizer] },
  ];

  for (const row of organizersMap) {
    const evt = events.find((e) => e.name === row.eventName);
    if (!evt) continue;
    for (const u of row.users) {
      await safeCreate(
        prisma.eventOrganizer.create({
          data: { eventId: evt.id, userId: u.id },
        })
      );
    }
  }

  const guestsMap = [
    {
      eventName: "Welcome Week Mixer",
      users: [student1, student2, student3, student4],
    },
    {
      eventName: "Computer Science Career Fair",
      users: [student1, student5, student6],
    },
    {
      eventName: "Mental Health Awareness Workshop",
      users: [student2, student3, student7],
    },
    { eventName: "Resume Review Session", users: [student4, student5] },
  ];

  for (const row of guestsMap) {
    const evt = events.find((e) => e.name === row.eventName);
    if (!evt) continue;
    for (const u of row.users) {
      await safeCreate(
        prisma.eventGuest.create({
          data: {
            eventId: evt.id,
            userId: u.id,
            confirmed: true,
            confirmedAt: new Date(),
          },
        })
      );
    }
  }

  // 30+ transactions

  const transactions = [];

  // purchase transactions
  transactions.push(
    await createTransaction(
      TransactionType.purchase,
      -50,
      student1,
      cashier,
      "Coffee and donut"
    )
  );
  transactions.push(
    await createTransaction(
      TransactionType.purchase,
      -25,
      student2,
      cashier,
      "Bottled water"
    )
  );
  transactions.push(
    await createTransaction(
      TransactionType.purchase,
      -75,
      student3,
      cashier,
      "Lunch combo"
    )
  );
  transactions.push(
    await createTransaction(
      TransactionType.purchase,
      -30,
      student4,
      cashier,
      "Snack pack"
    )
  );
  transactions.push(
    await createTransaction(
      TransactionType.purchase,
      -60,
      student5,
      cashier,
      "Breakfast sandwich"
    )
  );
  transactions.push(
    await createTransaction(
      TransactionType.purchase,
      -45,
      student6,
      cashier,
      "Smoothie"
    )
  );
  transactions.push(
    await createTransaction(
      TransactionType.purchase,
      -35,
      student7,
      cashier,
      "Energy drink"
    )
  );
  transactions.push(
    await createTransaction(
      TransactionType.purchase,
      -40,
      student1,
      cashier,
      "Protein bar"
    )
  );

  // redemption transactions
  transactions.push(
    await createTransaction(
      TransactionType.redemption,
      -100,
      student1,
      cashier,
      "T-shirt redemption"
    )
  );
  transactions.push(
    await createTransaction(
      TransactionType.redemption,
      -200,
      student2,
      cashier,
      "Water bottle redemption"
    )
  );
  transactions.push(
    await createTransaction(
      TransactionType.redemption,
      -150,
      student5,
      cashier,
      "Notebook redemption"
    )
  );
  transactions.push(
    await createTransaction(
      TransactionType.redemption,
      -75,
      student7,
      cashier,
      "Keychain redemption"
    )
  );

  // adjustment transactions (at least 2)
  transactions.push(
    await createTransaction(
      TransactionType.adjustment,
      50,
      student3,
      manager,
      "Bonus for survey completion"
    )
  );
  transactions.push(
    await createTransaction(
      TransactionType.adjustment,
      25,
      student4,
      manager,
      "Account correction"
    )
  );
  transactions.push(
    await createTransaction(
      TransactionType.adjustment,
      -20,
      student6,
      manager,
      "Penalty for late return"
    )
  );
  transactions.push(
    await createTransaction(
      TransactionType.adjustment,
      75,
      student1,
      manager,
      "Referral bonus"
    )
  );

  // transfer transactions
  transactions.push(
    await createTransaction(
      TransactionType.transfer,
      -100,
      student1,
      student1,
      "Transferred to friend",
      null
    )
  );
  transactions.push(
    await createTransaction(
      TransactionType.transfer,
      100,
      student2,
      student1,
      "Received from friend",
      null
    )
  );
  transactions.push(
    await createTransaction(
      TransactionType.transfer,
      -50,
      student5,
      student5,
      "Group gift split",
      null
    )
  );
  transactions.push(
    await createTransaction(
      TransactionType.transfer,
      50,
      student6,
      student5,
      "Group gift split",
      null
    )
  );

  // event transactions
  const eWelcome = events.find((e) => e.name === "Welcome Week Mixer");
  if (eWelcome) {
    const welcomeGuests = await prisma.eventGuest.findMany({
      where: { eventId: eWelcome.id },
      include: { user: true },
    });
    for (const g of welcomeGuests) {
      await awardPointsToGuest({
        event: eWelcome,
        guest: g.user,
        manager,
        amount: 25,
        remark: "Welcome Week attendance",
      });
    }
  }

  const eCareerFair = events.find(
    (e) => e.name === "Computer Science Career Fair"
  );
  if (eCareerFair) {
    const fairGuests = await prisma.eventGuest.findMany({
      where: { eventId: eCareerFair.id },
      include: { user: true },
    });
    for (const g of fairGuests) {
      await awardPointsToGuest({
        event: eCareerFair,
        guest: g.user,
        manager,
        amount: 50,
        remark: "Career Fair participation",
      });
    }
  }

  //  more random transactions
  transactions.push(
    await createTransaction(
      TransactionType.purchase,
      -55,
      student2,
      cashier,
      "Tea and cookie"
    )
  );
  transactions.push(
    await createTransaction(
      TransactionType.purchase,
      -85,
      student3,
      cashier,
      "Burger meal"
    )
  );
  transactions.push(
    await createTransaction(
      TransactionType.purchase,
      -20,
      student4,
      cashier,
      "Candy bar"
    )
  );
  transactions.push(
    await createTransaction(
      TransactionType.purchase,
      -65,
      student5,
      cashier,
      "Pasta dish"
    )
  );
  transactions.push(
    await createTransaction(
      TransactionType.purchase,
      -15,
      student6,
      cashier,
      "Gum"
    )
  );
  transactions.push(
    await createTransaction(
      TransactionType.purchase,
      -90,
      student7,
      cashier,
      "Pizza slice"
    )
  );
  transactions.push(
    await createTransaction(
      TransactionType.purchase,
      -70,
      student1,
      cashier,
      "Salad bowl"
    )
  );

  transactions.push(
    await createTransaction(
      TransactionType.adjustment,
      30,
      student6,
      manager,
      "Event feedback bonus"
    )
  );
  transactions.push(
    await createTransaction(
      TransactionType.adjustment,
      -15,
      student7,
      manager,
      "Late fee"
    )
  );
  transactions.push(
    await createTransaction(
      TransactionType.adjustment,
      60,
      student4,
      manager,
      "Volunteer bonus"
    )
  );

  // 5+ promotions
  const promotions = [];

  const promo1 = await prisma.promotion.create({
    data: {
      name: "Welcome Week Special",
      description: "Double points on all purchases during Welcome Week",
      type: PromotionType.automatic,
      startTime: iso(nowMs - 7 * day),
      endTime: iso(nowMs + 7 * day),
      rate: 2.0,
      points: null,
      minSpending: null,
    },
  });
  promotions.push(promo1);

  const promo2 = await prisma.promotion.create({
    data: {
      name: "First Purchase Bonus",
      description: "Get 50 bonus points on your first purchase",
      type: PromotionType.onetime,
      startTime: iso(nowMs - 30 * day),
      endTime: iso(nowMs + 60 * day),
      rate: null,
      points: 50,
      minSpending: 10,
    },
  });
  promotions.push(promo2);

  const promo3 = await prisma.promotion.create({
    data: {
      name: "Weekend Warrior",
      description: "Earn triple points on weekend purchases",
      type: PromotionType.automatic,
      startTime: iso(nowMs),
      endTime: iso(nowMs + 90 * day),
      rate: 3.0,
      points: null,
      minSpending: null,
    },
  });
  promotions.push(promo3);

  const promo4 = await prisma.promotion.create({
    data: {
      name: "Study Break Reward",
      description: "Spend $20 or more and get 100 bonus points",
      type: PromotionType.onetime,
      startTime: iso(nowMs - 14 * day),
      endTime: iso(nowMs + 30 * day),
      rate: null,
      points: 100,
      minSpending: 20,
    },
  });
  promotions.push(promo4);

  const promo5 = await prisma.promotion.create({
    data: {
      name: "Loyalty Program",
      description: "Earn 1.5x points on all transactions",
      type: PromotionType.automatic,
      startTime: iso(nowMs),
      endTime: iso(nowMs + 180 * day),
      rate: 1.5,
      points: null,
      minSpending: null,
    },
  });
  promotions.push(promo5);

  const promo6 = await prisma.promotion.create({
    data: {
      name: "Exam Season Support",
      description: "Extra 75 points for purchases over $15 during exam period",
      type: PromotionType.onetime,
      startTime: iso(nowMs + 30 * day),
      endTime: iso(nowMs + 60 * day),
      rate: null,
      points: 75,
      minSpending: 15,
    },
  });
  promotions.push(promo6);

  const promoUsages = [];
  promoUsages.push(
    await prisma.promotionUsage.create({
      data: {
        userId: student1.id,
        promotionId: promo1.id,
        usedAt: new Date(nowMs - 3 * day),
      },
    })
  );
  promoUsages.push(
    await prisma.promotionUsage.create({
      data: {
        userId: student2.id,
        promotionId: promo2.id,
        usedAt: new Date(nowMs - 5 * day),
      },
    })
  );
  promoUsages.push(
    await prisma.promotionUsage.create({
      data: {
        userId: student3.id,
        promotionId: promo4.id,
        usedAt: new Date(nowMs - 1 * day),
      },
    })
  );

  console.log("seeding is complete.");
  console.log(`Created ${allUsers.length} users`);
  console.log(`Created ${events.length} events`);
  console.log(`Created ${transactions.length + 4} transactions`);
  console.log(`Created ${promotions.length} promotions`);
}

main()
  .catch((e) => {
    console.error("Error seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
