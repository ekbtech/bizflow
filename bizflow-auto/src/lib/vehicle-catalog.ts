export const vehicleModelsByMake = {
  Toyota: [
    "Auris", "Avensis", "Axio", "Aqua", "Belta", "Camry", "C-HR", "Corolla", "Corolla Cross",
    "Fielder", "Fortuner", "Harrier", "Hiace", "Hilux", "Land Cruiser", "Land Cruiser Prado",
    "Noah", "Passo", "Premio", "Prius", "Probox", "RAV4", "Rush", "Sienta", "Vitz", "Voxy", "Yaris",
  ],
  Nissan: [
    "AD Van", "Dualis", "Juke", "March", "Navara", "Note", "NV200", "Pathfinder", "Patrol",
    "Qashqai", "Serena", "Sylphy", "Teana", "Tiida", "X-Trail",
  ],
  Honda: [
    "Accord", "CR-V", "Civic", "Fit", "Fit Shuttle", "HR-V", "Insight", "Jazz", "Stepwgn", "Vezel",
  ],
  Subaru: ["BRZ", "Forester", "Impreza", "Legacy", "Levorg", "Outback", "XV"],
  Mazda: ["Atenza", "Axela", "CX-3", "CX-5", "CX-30", "CX-60", "Demio", "Familia", "Premacy"],
  Mitsubishi: ["ASX", "Canter", "Delica", "L200", "Lancer", "Outlander", "Pajero", "RVR"],
  Suzuki: ["Alto", "Baleno", "Celerio", "Escudo", "Swift", "SX4", "Vitara", "Wagon R"],
  Isuzu: ["D-Max", "D-Max V-Cross", "Elf", "MU-X", "N-Series", "Trooper"],
  Mercedes: ["A-Class", "C-Class", "E-Class", "GLA", "GLC", "GLE", "GLS", "Sprinter"],
  BMW: ["1 Series", "2 Series", "3 Series", "5 Series", "7 Series", "X1", "X3", "X5", "X6"],
  Volkswagen: ["Amarok", "Golf", "Passat", "Polo", "Tiguan", "Touareg", "Transporter"],
  Audi: ["A3", "A4", "A6", "Q3", "Q5", "Q7", "Q8"],
  Ford: ["EcoSport", "Everest", "Fiesta", "Focus", "Ranger", "Transit"],
  Hyundai: ["Accent", "Creta", "Elantra", "Santa Fe", "Sonata", "Tucson", "Venue"],
  Kia: ["Carens", "Cerato", "Picanto", "Rio", "Sorento", "Sportage", "Seltos"],
  Lexus: ["ES", "GX", "IS", "LX", "NX", "RX", "UX"],
  "Land Rover": ["Defender", "Discovery", "Discovery Sport", "Range Rover", "Range Rover Evoque", "Range Rover Sport"],
  Jeep: ["Cherokee", "Compass", "Gladiator", "Grand Cherokee", "Renegade", "Wrangler"],
  Peugeot: ["2008", "3008", "308", "408", "508", "Partner"],
  Renault: ["Duster", "Kangoo", "Koleos", "Logan", "Megane", "Sandero"],
  Volvo: ["S60", "S90", "V40", "XC40", "XC60", "XC90"],
  Tata: ["Harrier", "Nexon", "Safari", "Tiago", "Xenon"],
  Chevrolet: ["Captiva", "Colorado", "Cruze", "Equinox", "Trailblazer"],
  Porsche: ["Cayenne", "Macan", "Panamera", "Taycan"],
} as const;

export type CatalogVehicleMake = keyof typeof vehicleModelsByMake;
export const vehicleMakes = Object.keys(vehicleModelsByMake) as CatalogVehicleMake[];
export const OTHER_VEHICLE_OPTION = "__OTHER__";
