import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const parts = [
  ...[
    ["Engine", "Engine oil filter"], ["Engine", "Air filter"], ["Engine", "Fuel filter"],
    ["Engine", "Spark plug"], ["Engine", "Ignition coil"], ["Engine", "Timing belt kit"],
    ["Engine", "Serpentine belt"], ["Engine", "Water pump"], ["Cooling", "Radiator"],
    ["Cooling", "Radiator hose set"], ["Cooling", "Thermostat"], ["Cooling", "Coolant reservoir"],
    ["Cooling", "Cooling fan"], ["Electrical", "12V battery"], ["Electrical", "Alternator"],
    ["Electrical", "Starter motor"], ["Electrical", "Headlamp bulb"], ["Electrical", "Wiper blades"],
    ["Brakes", "Front brake pads"], ["Brakes", "Rear brake pads"], ["Brakes", "Brake disc"],
    ["Brakes", "Brake caliper"], ["Brakes", "Brake master cylinder"], ["Brakes", "Brake fluid"],
    ["Suspension", "Shock absorber"], ["Suspension", "Strut assembly"], ["Suspension", "Control arm"],
    ["Suspension", "Ball joint"], ["Steering", "Tie rod end"], ["Steering", "Power steering pump"],
    ["Transmission", "Clutch kit"], ["Transmission", "Clutch master cylinder"], ["Transmission", "Gearbox mount"],
    ["Drivetrain", "CV joint"], ["Drivetrain", "Drive shaft"], ["Tyres and wheels", "Car tyre"],
    ["Tyres and wheels", "Wheel bearing"], ["Tyres and wheels", "Wheel nut set"],
    ["Body", "Side mirror"], ["Body", "Door handle"], ["Body", "Windscreen wiper motor"],
    ["Service consumables", "Engine oil"], ["Service consumables", "Transmission oil"],
    ["Service consumables", "Air-conditioning refrigerant"],
  ].map(([category, name]) => ({ vehicleType: "CAR", category, name })),
  ...[
    ["Drivetrain", "Bicycle chain"], ["Drivetrain", "Cassette sprocket"], ["Drivetrain", "Freewheel"],
    ["Drivetrain", "Front chainring"], ["Drivetrain", "Crank arm set"], ["Drivetrain", "Bottom bracket"],
    ["Drivetrain", "Pedal pair"], ["Drivetrain", "Rear derailleur"], ["Drivetrain", "Front derailleur"],
    ["Drivetrain", "Shift cable set"], ["Brakes", "Rim brake pad set"], ["Brakes", "Disc brake pad set"],
    ["Brakes", "Brake rotor"], ["Brakes", "Brake cable set"], ["Brakes", "Hydraulic brake hose"],
    ["Tyres and wheels", "Bicycle tyre"], ["Tyres and wheels", "Inner tube"], ["Tyres and wheels", "Rim tape"],
    ["Tyres and wheels", "Wheel spoke"], ["Tyres and wheels", "Front hub"], ["Tyres and wheels", "Rear hub"],
    ["Steering", "Headset bearing set"], ["Steering", "Handlebar grip pair"], ["Steering", "Stem"],
    ["Suspension", "Fork seal kit"], ["Suspension", "Rear shock bushing"],
    ["Frame and seating", "Saddle"], ["Frame and seating", "Seatpost"], ["Frame and seating", "Seat clamp"],
    ["Lighting and safety", "Front bicycle light"], ["Lighting and safety", "Rear bicycle light"],
    ["Service consumables", "Chain lubricant"], ["Service consumables", "Tubeless sealant"],
  ].map(([category, name]) => ({ vehicleType: "BICYCLE", category, name })),
  ...[
    ["Engine", "Motorcycle oil filter"], ["Engine", "Motorcycle air filter"], ["Engine", "Motorcycle spark plug"],
    ["Engine", "Piston and ring kit"], ["Engine", "Cylinder gasket set"], ["Engine", "Cam chain"],
    ["Engine", "Engine valve set"], ["Cooling", "Motorcycle radiator"], ["Cooling", "Coolant hose"],
    ["Electrical", "Motorcycle battery"], ["Electrical", "Regulator rectifier"], ["Electrical", "Ignition coil"],
    ["Electrical", "Starter relay"], ["Electrical", "Headlamp assembly"], ["Electrical", "Stator coil"],
    ["Brakes", "Front brake pad set"], ["Brakes", "Rear brake pad set"], ["Brakes", "Brake disc"],
    ["Brakes", "Brake master cylinder"], ["Brakes", "Brake lever"], ["Brakes", "Brake shoe set"],
    ["Drivetrain", "Motorcycle chain"], ["Drivetrain", "Front sprocket"], ["Drivetrain", "Rear sprocket"],
    ["Drivetrain", "Clutch plate set"], ["Drivetrain", "Clutch cable"], ["Drivetrain", "Gear shift lever"],
    ["Tyres and wheels", "Motorcycle tyre"], ["Tyres and wheels", "Motorcycle inner tube"],
    ["Tyres and wheels", "Wheel bearing set"], ["Suspension", "Front fork seal kit"],
    ["Suspension", "Rear shock absorber"], ["Controls", "Throttle cable"], ["Controls", "Handlebar grip pair"],
    ["Body", "Side mirror pair"], ["Body", "Indicator lamp"], ["Service consumables", "Motorcycle engine oil"],
  ].map(([category, name]) => ({ vehicleType: "MOTORBIKE", category, name })),
];

const services = [
  ...[
    ["Engine", "Engine mechanic", "Engine oil and filter service"],
    ["Engine", "Engine mechanic", "Engine diagnostics"], ["Engine", "Engine mechanic", "Engine tune-up"],
    ["Engine", "Engine mechanic", "Timing belt replacement"], ["Engine", "Engine mechanic", "Engine overhaul"],
    ["Cooling", "Cooling-system mechanic", "Cooling system pressure test"],
    ["Cooling", "Cooling-system mechanic", "Radiator repair or replacement"],
    ["Cooling", "Cooling-system mechanic", "Coolant flush"], ["Electrical", "Auto electrician", "Battery test and replacement"],
    ["Electrical", "Auto electrician", "Alternator and charging repair"],
    ["Electrical", "Auto electrician", "Starter motor repair"], ["Electrical", "Auto electrician", "Lighting and wiring repair"],
    ["Brakes", "Brake specialist", "Brake inspection"], ["Brakes", "Brake specialist", "Brake pad replacement"],
    ["Brakes", "Brake specialist", "Brake disc skimming or replacement"],
    ["Brakes", "Brake specialist", "Brake fluid flush"], ["Suspension", "Suspension mechanic", "Suspension inspection"],
    ["Suspension", "Suspension mechanic", "Shock absorber replacement"],
    ["Suspension", "Suspension mechanic", "Wheel alignment"],
    ["Steering", "Steering mechanic", "Steering system repair"], ["Steering", "Steering mechanic", "Power steering service"],
    ["Transmission", "Transmission mechanic", "Clutch repair or replacement"],
    ["Transmission", "Transmission mechanic", "Gearbox diagnosis and repair"],
    ["Drivetrain", "Drivetrain mechanic", "CV joint and axle repair"],
    ["Tyres and wheels", "Tyre technician", "Tyre repair or replacement"],
    ["Tyres and wheels", "Tyre technician", "Wheel balancing"], ["Tyres and wheels", "Tyre technician", "Wheel bearing replacement"],
    ["Air conditioning", "Auto air-conditioning technician", "Air-conditioning diagnosis"],
    ["Air conditioning", "Auto air-conditioning technician", "Air-conditioning service and regas"],
    ["Body", "Body repair technician", "Panel beating and body repair"],
    ["Body", "Body repair technician", "Vehicle paint repair"],
    ["General service", "General mechanic", "Pre-purchase vehicle inspection"],
    ["General service", "General mechanic", "Full vehicle service"],
  ].map(([category, mechanicSpecialty, name]) => ({ vehicleType: "CAR", category, mechanicSpecialty, name })),
  ...[
    ["Drivetrain", "Bicycle mechanic", "Chain clean and lubrication"],
    ["Drivetrain", "Bicycle mechanic", "Chain and cassette replacement"],
    ["Drivetrain", "Bicycle mechanic", "Gear tuning and adjustment"],
    ["Drivetrain", "Bicycle mechanic", "Derailleur repair or replacement"],
    ["Drivetrain", "Bicycle mechanic", "Crankset and bottom bracket service"],
    ["Brakes", "Bicycle brake technician", "Brake adjustment"],
    ["Brakes", "Bicycle brake technician", "Brake pad replacement"],
    ["Brakes", "Bicycle brake technician", "Hydraulic brake bleed"],
    ["Brakes", "Bicycle brake technician", "Disc rotor replacement"],
    ["Tyres and wheels", "Bicycle wheel technician", "Puncture repair and tube replacement"],
    ["Tyres and wheels", "Bicycle wheel technician", "Tubeless tyre setup"],
    ["Tyres and wheels", "Bicycle wheel technician", "Wheel truing and spoke replacement"],
    ["Tyres and wheels", "Bicycle wheel technician", "Hub bearing service"],
    ["Suspension", "Bicycle suspension technician", "Fork service"],
    ["Suspension", "Bicycle suspension technician", "Rear shock service"],
    ["Steering", "Bicycle mechanic", "Headset adjustment or replacement"],
    ["Frame and seating", "Bicycle mechanic", "Saddle and seatpost fitting"],
    ["Electrical", "E-bike technician", "E-bike battery and electrical diagnosis"],
    ["Electrical", "E-bike technician", "E-bike motor and controller diagnosis"],
    ["General service", "Bicycle mechanic", "Bicycle safety inspection"],
    ["General service", "Bicycle mechanic", "Full bicycle tune-up"],
    ["General service", "Bicycle mechanic", "Bicycle assembly"],
  ].map(([category, mechanicSpecialty, name]) => ({ vehicleType: "BICYCLE", category, mechanicSpecialty, name })),
  ...[
    ["Engine", "Motorcycle mechanic", "Motorcycle engine oil and filter service"],
    ["Engine", "Motorcycle mechanic", "Engine diagnostics and tune-up"],
    ["Engine", "Motorcycle mechanic", "Valve clearance adjustment"],
    ["Engine", "Motorcycle mechanic", "Piston and cylinder repair"],
    ["Engine", "Motorcycle mechanic", "Engine overhaul"],
    ["Electrical", "Motorcycle auto electrician", "Battery and charging system test"],
    ["Electrical", "Motorcycle auto electrician", "Starter and ignition repair"],
    ["Electrical", "Motorcycle auto electrician", "Lighting and wiring repair"],
    ["Brakes", "Motorcycle brake specialist", "Brake inspection and adjustment"],
    ["Brakes", "Motorcycle brake specialist", "Brake pad or shoe replacement"],
    ["Brakes", "Motorcycle brake specialist", "Brake fluid flush"],
    ["Drivetrain", "Motorcycle drivetrain mechanic", "Chain adjustment and lubrication"],
    ["Drivetrain", "Motorcycle drivetrain mechanic", "Chain and sprocket replacement"],
    ["Drivetrain", "Motorcycle drivetrain mechanic", "Clutch repair"],
    ["Tyres and wheels", "Motorcycle tyre technician", "Tyre repair or replacement"],
    ["Tyres and wheels", "Motorcycle tyre technician", "Wheel balancing and bearing service"],
    ["Suspension", "Motorcycle suspension mechanic", "Fork seal and oil service"],
    ["Suspension", "Motorcycle suspension mechanic", "Rear shock replacement"],
    ["Controls", "Motorcycle mechanic", "Cable and control adjustment"],
    ["Cooling", "Motorcycle mechanic", "Cooling system service"],
    ["General service", "Motorcycle mechanic", "Motorcycle safety inspection"],
    ["General service", "Motorcycle mechanic", "Full motorcycle service"],
  ].map(([category, mechanicSpecialty, name]) => ({ vehicleType: "MOTORBIKE", category, mechanicSpecialty, name })),
];

async function seedParts() {
  let created = 0;
  for (const item of parts) {
    const existing = await prisma.sparePart.findFirst({
      where: { name: item.name, vehicleType: item.vehicleType, category: item.category },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.sparePart.create({
      data: {
        ...item,
        quantity: 0,
        stockCounted: false,
        unitPrice: 0,
        priceConfigured: false,
        reorderLevel: 10,
      },
    });
    created += 1;
  }
  return created;
}

async function seedServices() {
  let created = 0;
  for (const item of services) {
    const existing = await prisma.service.findFirst({
      where: { name: item.name, vehicleType: item.vehicleType, category: item.category },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.service.create({
      data: { ...item, price: 0, priceConfigured: false },
    });
    created += 1;
  }
  return created;
}

try {
  const [partsCreated, servicesCreated] = await Promise.all([seedParts(), seedServices()]);
  console.log(`Catalog complete: ${partsCreated} parts and ${servicesCreated} services added; existing stock and prices were preserved.`);
} catch (error) {
  console.error("Vehicle catalog seed failed.", error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
