const wmiMap: Record<string, { brand: string; country: string }> = {
  'NL1': { brand: 'Togg', country: 'Türkiye' },
  'NLA': { brand: 'Honda', country: 'Türkiye' },
  'NLN': { brand: 'Karsan', country: 'Türkiye' },
  'NLR': { brand: 'Otokar', country: 'Türkiye' },
  'NLT': { brand: 'Temsa', country: 'Türkiye' },
  'NMC': { brand: 'BMC', country: 'Türkiye' },
  'NLE': { brand: 'Mercedes-Benz', country: 'Türkiye' },
  'NMB': { brand: 'Mercedes-Benz', country: 'Türkiye' },
  'NM0': { brand: 'Ford', country: 'Türkiye' },
  'NM1': { brand: 'Renault', country: 'Türkiye' },
  'NM4': { brand: 'Fiat', country: 'Türkiye' },
  'NMT': { brand: 'Toyota', country: 'Türkiye' },
  'NL3': { brand: 'Hyundai', country: 'Türkiye' },
  'NLH': { brand: 'Honda', country: 'Türkiye' },
  'VF1': { brand: 'Renault', country: 'Fransa' },
  'VF3': { brand: 'Peugeot', country: 'Fransa' },
  'VF7': { brand: 'Citroen', country: 'Fransa' },
  'UU1': { brand: 'Dacia', country: 'Romanya' },
  'ZFA': { brand: 'Fiat', country: 'İtalya' },
  'TMB': { brand: 'Skoda', country: 'Çek Cumhuriyeti' },
  'WVW': { brand: 'Volkswagen', country: 'Almanya' },
  'WVG': { brand: 'Volkswagen', country: 'Almanya' },
  'WV1': { brand: 'Volkswagen', country: 'Almanya' },
  'WV2': { brand: 'Volkswagen', country: 'Almanya' },
  'W0L': { brand: 'Opel', country: 'Almanya' },
  'W0V': { brand: 'Opel', country: 'Almanya' },
  'WBA': { brand: 'BMW', country: 'Almanya' },
  'WBS': { brand: 'BMW', country: 'Almanya' },
  'WAU': { brand: 'Audi', country: 'Almanya' },
  'WUA': { brand: 'Audi', country: 'Almanya' },
  'WDB': { brand: 'Mercedes-Benz', country: 'Almanya' },
  'WDD': { brand: 'Mercedes-Benz', country: 'Almanya' },
  'W1K': { brand: 'Mercedes-Benz', country: 'Almanya' },
  'WF0': { brand: 'Ford', country: 'Almanya' },
  '1FT': { brand: 'Ford', country: 'ABD' },
  '1FC': { brand: 'Ford', country: 'ABD' },
  '1FM': { brand: 'Ford', country: 'ABD' },
  '1FD': { brand: 'Ford', country: 'ABD' },
  'SAL': { brand: 'Land Rover', country: 'İngiltere' },
  'SAD': { brand: 'Jaguar', country: 'İngiltere' },
  'SAJ': { brand: 'Jaguar', country: 'İngiltere' },
  'YV1': { brand: 'Volvo', country: 'İsveç' },
  'KL3': { brand: 'Chevrolet', country: 'Güney Kore' },
  'KLA': { brand: 'Chevrolet', country: 'Güney Kore' },
  'KMH': { brand: 'Hyundai', country: 'Güney Kore' },
  'KHM': { brand: 'Hyundai', country: 'Güney Kore' },
  'KNA': { brand: 'Kia', country: 'Güney Kore' },
  'KNE': { brand: 'Kia', country: 'Güney Kore' },
  'JT1': { brand: 'Toyota', country: 'Japonya' },
  'JTD': { brand: 'Toyota', country: 'Japonya' },
  'JT2': { brand: 'Toyota', country: 'Japonya' },
  'JHM': { brand: 'Honda', country: 'Japonya' },
  'JH4': { brand: 'Honda', country: 'Japonya' },
  'JM1': { brand: 'Mazda', country: 'Japonya' },
  'JMB': { brand: 'Mitsubishi', country: 'Japonya' },
  'LSY': { brand: 'MG', country: 'Çin' },
  'LVS': { brand: 'Ford', country: 'Çin' },
  'LTV': { brand: 'Toyota', country: 'Çin' },
  'LHG': { brand: 'Honda', country: 'Çin' },
  'MAL': { brand: 'Hyundai', country: 'Hindistan' },
  'MNT': { brand: 'Nissan', country: 'Hindistan' },
  'SUF': { brand: 'Fiat', country: 'Polonya' },
  'VSX': { brand: 'Opel', country: 'İspanya' },
  'VSS': { brand: 'Seat', country: 'İspanya' }
}

const yearMap: Record<string, number> = {
  'Y': 2000,
  '1': 2001, '2': 2002, '3': 2003, '4': 2004, '5': 2005, '6': 2006, '7': 2007, '8': 2008, '9': 2009,
  'A': 2010, 'B': 2011, 'C': 2012, 'D': 2013, 'E': 2014, 'F': 2015, 'G': 2016, 'H': 2017, 'J': 2018, 'K': 2019,
  'L': 2020, 'M': 2021, 'N': 2022, 'P': 2023, 'R': 2024, 'S': 2025, 'T': 2026, 'V': 2027, 'W': 2028, 'X': 2029
}

// Modulus 11 algorithm letter values
const letterValues: Record<string, number> = {
  'A': 1, 'B': 2, 'C': 3, 'D': 4, 'E': 5, 'F': 6, 'G': 7, 'H': 8,
  'J': 1, 'K': 2, 'L': 3, 'M': 4, 'N': 5, 'P': 7, 'R': 9,
  'S': 2, 'T': 3, 'U': 4, 'V': 5, 'W': 6, 'X': 7, 'Y': 8, 'Z': 9
}

const weights = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2]

export function checkVinChecksum(vin: string): boolean {
  if (vin.length !== 17) return false
  
  let sum = 0
  for (let i = 0; i < 17; i++) {
    const char = vin[i]
    let val = 0
    
    if (char >= '0' && char <= '9') {
      val = parseInt(char, 10)
    } else {
      val = letterValues[char] || 0
    }
    
    sum += val * weights[i]
  }
  
  const remainder = sum % 11
  const calculatedCheckDigit = remainder === 10 ? 'X' : String(remainder)
  const actualCheckDigit = vin[8]
  
  return calculatedCheckDigit === actualCheckDigit
}

export interface VinInfo {
  brand: string
  country: string
  year: number | null
  isValidChecksum: boolean
  checksumApplies: boolean
}

export function decodeVin(vin: string): VinInfo | null {
  const cleanVin = vin.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (cleanVin.length < 3) return null

  const wmi = cleanVin.substring(0, 3)
  let wmiInfo = wmiMap[wmi]
  
  if (!wmiInfo) {
    // Try 2-char code lookup
    wmiInfo = wmiMap[wmi.substring(0, 2)]
  }
  
  const brand = wmiInfo ? wmiInfo.brand : ''
  const country = wmiInfo ? wmiInfo.country : ''
  
  const isNorthAmerican = ['1', '2', '3', '4', '5'].includes(cleanVin[0])
  const isValidChecksum = checkVinChecksum(cleanVin)
  const checksumApplies = isNorthAmerican || isValidChecksum

  let year: number | null = null
  if (cleanVin.length >= 10) {
    const yearChar = cleanVin[9]
    const extractedYear = yearMap[yearChar] || null
    
    // Brands that do not use the 10th character for the model year in European/Asian VINs
    const brandsWithoutEuYear = [
      'Renault',
      'Peugeot',
      'Citroen',
      'Dacia',
      'Fiat',
      'BMW',
      'Mercedes-Benz',
      'Land Rover',
      'Jaguar',
      'Honda',
      'Mazda',
      'Mitsubishi',
      'Nissan',
      'Otokar',
      'Temsa',
      'BMC',
      'Karsan'
    ]
    
    if (extractedYear) {
      if (checksumApplies || !brandsWithoutEuYear.includes(brand)) {
        year = extractedYear
      }
    }
  }

  return {
    brand,
    country,
    year,
    isValidChecksum,
    checksumApplies
  }
}
