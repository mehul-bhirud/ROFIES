import type { CatalogItemView, OperationalSummary } from "@/lib/catalog/types";

export const demoCatalog: readonly CatalogItemView[] = [
  {
    id: "00000000-0000-0000-0000-000000000101",
    name: "Arduino Mega 2560",
    description: "High-I/O ATmega2560 development board for embedded prototypes.",
    categoryName: "Controllers",
    trackingMode: "pooled_reusable",
    usableOnHand: 10,
    repairQuantity: 0,
    expectedOn: null,
    tags: ["Embedded", "5 V", "USB"],
    publicRemarks: "USB cable is issued separately.",
    specifications: { Processor: "ATmega2560", "Digital I/O": "54 pins", "Logic voltage": "5 V" },
    illustration: "controller",
    photo: {
      src: "/equipment/arduino-mega.webp",
      alt: "Blue microcontroller development board on a technical workbench"
    }
  },
  {
    id: "00000000-0000-0000-0000-000000000102",
    name: "Dynamixel XL430-W250",
    description: "Smart serial actuator for mobile robots and compact manipulators.",
    categoryName: "Actuation",
    trackingMode: "pooled_reusable",
    usableOnHand: 12,
    repairQuantity: 0,
    expectedOn: "12 Aug",
    tags: ["Actuator", "TTL serial", "12 V"],
    publicRemarks: "Use only with the approved power hub.",
    specifications: { Protocol: "DYNAMIXEL 2.0", Torque: "1.4 N·m", Resolution: "4096 steps" },
    illustration: "actuator",
    photo: null
  },
  {
    id: "00000000-0000-0000-0000-000000000103",
    name: "Jetson Orin Nano Kit",
    description: "Edge AI development kit with carrier board and matched power supply.",
    categoryName: "Controllers",
    trackingMode: "individual_asset",
    usableOnHand: 1,
    repairQuantity: 0,
    expectedOn: null,
    tags: ["AI", "CUDA", "8 GB"],
    publicRemarks: "A short checkout briefing is required.",
    specifications: { Memory: "8 GB", Performance: "40 TOPS", Power: "7–15 W" },
    illustration: "compute",
    photo: {
      src: "/equipment/edge-ai-kit.webp",
      alt: "Compact edge-AI development kit with heatsink and power supply"
    }
  },
  {
    id: "00000000-0000-0000-0000-000000000104",
    name: "Lead-free Soldering Station",
    description: "Temperature-controlled station for supervised electronics assembly.",
    categoryName: "Fabrication",
    trackingMode: "individual_asset",
    usableOnHand: 1,
    repairQuantity: 0,
    expectedOn: "10 Aug",
    tags: ["Bench tool", "ESD safe"],
    publicRemarks: "Use only in supervised project spaces.",
    specifications: { Power: "70 W", Range: "150–450 °C", Tip: "T18 series" },
    illustration: "tool",
    photo: {
      src: "/equipment/soldering-station.webp",
      alt: "Temperature-controlled soldering station with iron and safety stand"
    }
  },
  {
    id: "00000000-0000-0000-0000-000000000105",
    name: "M3 Fastener Kit",
    description: "Assorted M3 screws, nuts, and spacers issued by packet.",
    categoryName: "Components",
    trackingMode: "consumable",
    usableOnHand: 38,
    repairQuantity: 0,
    expectedOn: null,
    tags: ["Consumable", "Mechanical"],
    publicRemarks: "Quantities are issued by packet.",
    specifications: { Thread: "M3", Material: "Zinc-plated steel", Packet: "30 pieces" },
    illustration: "parts",
    photo: null
  },
  {
    id: "00000000-0000-0000-0000-000000000108",
    name: "USB Logic Analyzer",
    description: "Eight-channel analyzer for digital bus and timing diagnostics.",
    categoryName: "Fabrication",
    trackingMode: "pooled_reusable",
    usableOnHand: 3,
    repairQuantity: 1,
    expectedOn: null,
    tags: ["Debug", "8 channel", "24 MHz"],
    publicRemarks: "Test clips are included.",
    specifications: { Channels: "8", Sample: "24 MHz", Protocols: "I²C, SPI, UART" },
    illustration: "analyzer",
    photo: {
      src: "/equipment/logic-analyzer.webp",
      alt: "Compact USB logic analyzer with color-coded test leads"
    }
  }
];

export const demoMemberRequests = [
  {
    id: "REQ-0241",
    title: "Autonomy Sprint",
    status: "Under review",
    detail: "Arduino Mega ×2 · 11–16 Aug",
    updated: "35 min ago"
  },
  {
    id: "REQ-0228",
    title: "Vision bench",
    status: "Ready for pickup",
    detail: "Jetson Orin Nano ×1 · pickup by 18:00",
    updated: "Today"
  },
  {
    id: "REQ-0193",
    title: "Motor characterization",
    status: "Partially returned",
    detail: "2 of 4 Dynamixel actuators still due",
    updated: "Due 12 Aug"
  }
] as const;

export const demoApprovalQueue = [
  {
    id: "REQ-0241",
    borrower: "Anaya Kulkarni",
    purpose: "Line-following robot control prototype",
    period: "11–16 Aug",
    lines: 2,
    age: "35 min",
    conflict: false
  },
  {
    id: "REQ-0240",
    borrower: "Kabir Shah",
    purpose: "Stepper characterization fixture",
    period: "13–18 Aug",
    lines: 1,
    age: "1 h 12 min",
    conflict: true
  },
  {
    id: "REQ-0237",
    borrower: "Tara Singh",
    purpose: "Manipulator gripper rebuild",
    period: "10–12 Aug",
    lines: 3,
    age: "3 h 08 min",
    conflict: false
  }
] as const;

export const demoSummary: OperationalSummary = {
  pendingRequests: 7,
  pendingMemberApplications: 1,
  readyPickups: 4,
  overdueLoans: 3,
  repairQueue: 5,
  retentionFailures: 0
};

export const demoActivity = [
  {
    time: "17:42",
    action: "Return confirmed",
    detail: "USB Logic Analyzer ×1 · minor damage but usable",
    actor: "Meera Joshi"
  },
  {
    time: "17:18",
    action: "Reservation approved",
    detail: "Jetson Orin Nano · 11–15 Aug",
    actor: "Vivaan Iyer"
  },
  {
    time: "16:55",
    action: "Handover confirmed",
    detail: "Arduino Mega 2560 ×2 · due 14 Aug",
    actor: "Meera Joshi"
  },
  {
    time: "16:21",
    action: "Repair route opened",
    detail: "USB Logic Analyzer · intermittent channel 4",
    actor: "Meera Joshi"
  }
] as const;
