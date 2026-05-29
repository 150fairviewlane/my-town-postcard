// Georgia Territory Seed Data
// My Town Postcard, LLC
// 95 territories covering all 159 Georgia counties

export interface GaTerritoryRow {
  id: string;
  name: string;
  state: "GA";
  counties: string[];
  zoneNote: string;
  households: number;
  status: "available" | "pending" | "taken";
}

export const GEORGIA_TERRITORIES: GaTerritoryRow[] = [

  // ── TIER 1 — METRO SPLITS (Fulton, Gwinnett, Cobb, DeKalb) ──────────────────
  { id: "GA-001", name: "Fulton County — North",       state: "GA", counties: ["Fulton"],             zoneNote: "Alpharetta, Roswell, Milton, Johns Creek",            households: 125000, status: "available" },
  { id: "GA-002", name: "Fulton County — Central",     state: "GA", counties: ["Fulton"],             zoneNote: "Atlanta, Buckhead, Sandy Springs, Midtown",           households: 110000, status: "available" },
  { id: "GA-003", name: "Fulton County — South",       state: "GA", counties: ["Fulton"],             zoneNote: "Union City, Fairburn, Palmetto, South Fulton",        households: 85000,  status: "available" },
  { id: "GA-004", name: "Gwinnett County — West",      state: "GA", counties: ["Gwinnett"],           zoneNote: "Norcross, Peachtree Corners, Duluth, Berkeley Lake",  households: 105000, status: "available" },
  { id: "GA-005", name: "Gwinnett County — Central",   state: "GA", counties: ["Gwinnett"],           zoneNote: "Lawrenceville, Snellville, Lilburn, Stone Mountain",  households: 98000,  status: "available" },
  { id: "GA-006", name: "Gwinnett County — Northeast", state: "GA", counties: ["Gwinnett"],           zoneNote: "Buford, Sugar Hill, Dacula, Grayson, Loganville",     households: 90000,  status: "available" },
  { id: "GA-007", name: "Cobb County — North",         state: "GA", counties: ["Cobb"],              zoneNote: "Marietta, Kennesaw, Acworth, Woodstock area",         households: 95000,  status: "available" },
  { id: "GA-008", name: "Cobb County — South",         state: "GA", counties: ["Cobb"],              zoneNote: "Smyrna, Vinings, Austell, Mableton, Powder Springs",  households: 90000,  status: "available" },
  { id: "GA-009", name: "DeKalb County — North",       state: "GA", counties: ["DeKalb"],            zoneNote: "Dunwoody, Doraville, Chamblee, Tucker, Clarkston",    households: 95000,  status: "available" },
  { id: "GA-010", name: "DeKalb County — South",       state: "GA", counties: ["DeKalb"],            zoneNote: "Decatur, Lithonia, Stonecrest",                       households: 85000,  status: "available" },

  // ── TIER 2 — SINGLE COUNTY (Atlanta suburbs) ─────────────────────────────────
  { id: "GA-011", name: "Cherokee County",  state: "GA", counties: ["Cherokee"],  zoneNote: "Canton, Ball Ground, Holly Springs, Woodstock",      households: 105000, status: "available" },
  { id: "GA-012", name: "Forsyth County",   state: "GA", counties: ["Forsyth"],   zoneNote: "Cumming, South Forsyth",                             households: 100000, status: "available" },
  { id: "GA-013", name: "Henry County",     state: "GA", counties: ["Henry"],     zoneNote: "McDonough, Stockbridge, Hampton, Locust Grove",      households: 95000,  status: "available" },
  { id: "GA-014", name: "Clayton County",   state: "GA", counties: ["Clayton"],   zoneNote: "Jonesboro, Riverdale, Forest Park, College Park",    households: 105000, status: "available" },
  { id: "GA-015", name: "Paulding County",  state: "GA", counties: ["Paulding"],  zoneNote: "Dallas, Hiram, Powder Springs area",                 households: 58000,  status: "available" },
  { id: "GA-016", name: "Douglas County",   state: "GA", counties: ["Douglas"],   zoneNote: "Douglasville, Lithia Springs, Villa Rica area",      households: 50000,  status: "available" },
  { id: "GA-017", name: "Coweta County",    state: "GA", counties: ["Coweta"],    zoneNote: "Newnan, Senoia, Sharpsburg",                         households: 55000,  status: "available" },
  { id: "GA-018", name: "Fayette County",   state: "GA", counties: ["Fayette"],   zoneNote: "Fayetteville, Peachtree City, Tyrone, Brooks",       households: 48000,  status: "available" },
  { id: "GA-019", name: "Carroll County",   state: "GA", counties: ["Carroll"],   zoneNote: "Carrollton, Villa Rica, Whitesburg, Temple",         households: 45000,  status: "available" },
  { id: "GA-020", name: "Barrow County",    state: "GA", counties: ["Barrow"],    zoneNote: "Winder, Auburn, Bethlehem, Carl",                    households: 32000,  status: "available" },
  { id: "GA-021", name: "Rockdale County",  state: "GA", counties: ["Rockdale"],  zoneNote: "Conyers, Milstead",                                  households: 34000,  status: "available" },
  { id: "GA-022", name: "Newton County",    state: "GA", counties: ["Newton"],    zoneNote: "Covington, Oxford, Mansfield, Porterdale",           households: 40000,  status: "available" },
  { id: "GA-023", name: "Walton County",    state: "GA", counties: ["Walton"],    zoneNote: "Monroe, Social Circle, Loganville, Good Hope",       households: 38000,  status: "available" },
  { id: "GA-024", name: "Spalding County",  state: "GA", counties: ["Spalding"],  zoneNote: "Griffin, Orchard Hill, Sunny Side",                  households: 28000,  status: "available" },
  { id: "GA-025", name: "Jackson County",   state: "GA", counties: ["Jackson"],   zoneNote: "Jefferson, Commerce, Braselton, Hoschton",           households: 42000,  status: "available" },

  // ── TIER 2 — SINGLE COUNTY (North Georgia) ───────────────────────────────────
  { id: "GA-026", name: "Hall County",      state: "GA", counties: ["Hall"],      zoneNote: "Gainesville, Flowery Branch, Oakwood, Buford area",  households: 82000,  status: "available" },
  { id: "GA-027", name: "Whitfield County", state: "GA", counties: ["Whitfield"], zoneNote: "Dalton, Tunnel Hill, Cohutta, Varnell",              households: 38000,  status: "available" },
  { id: "GA-028", name: "Bartow County",    state: "GA", counties: ["Bartow"],    zoneNote: "Cartersville, Adairsville, Emerson, Euharlee",       households: 42000,  status: "available" },
  { id: "GA-029", name: "Floyd County",     state: "GA", counties: ["Floyd"],     zoneNote: "Rome, Cave Spring, Armuchee, Shannon",               households: 38000,  status: "available" },
  { id: "GA-030", name: "Catoosa County",   state: "GA", counties: ["Catoosa"],   zoneNote: "Ringgold, Fort Oglethorpe, Tunnel Hill area",        households: 25000,  status: "available" },
  { id: "GA-031", name: "Walker / Dade Counties", state: "GA", counties: ["Walker", "Dade"], zoneNote: "LaFayette, Rock Spring, Chickamauga, Trenton", households: 30000, status: "available" },
  { id: "GA-032", name: "Gordon County",    state: "GA", counties: ["Gordon"],    zoneNote: "Calhoun, Resaca, Fairmount, Plainville",             households: 26000,  status: "available" },
  { id: "GA-033", name: "Clarke County",    state: "GA", counties: ["Clarke"],    zoneNote: "Athens, Winterville, Bogart",                        households: 48000,  status: "available" },

  // ── TIER 2 — SINGLE COUNTY (Other major cities) ──────────────────────────────
  { id: "GA-034", name: "Chatham County",   state: "GA", counties: ["Chatham"],   zoneNote: "Savannah, Pooler, Garden City, Port Wentworth",      households: 108000, status: "available" },
  { id: "GA-035", name: "Richmond County",  state: "GA", counties: ["Richmond"],  zoneNote: "Augusta, Hephzibah, Blythe",                         households: 75000,  status: "available" },
  { id: "GA-036", name: "Muscogee County",  state: "GA", counties: ["Muscogee"],  zoneNote: "Columbus, Midland, Upatoi",                          households: 72000,  status: "available" },
  { id: "GA-037", name: "Bibb County",      state: "GA", counties: ["Bibb"],      zoneNote: "Macon, Lizella, Payne City",                         households: 55000,  status: "available" },
  { id: "GA-038", name: "Houston County",   state: "GA", counties: ["Houston"],   zoneNote: "Warner Robins, Perry, Centerville, Byron",           households: 60000,  status: "available" },
  { id: "GA-039", name: "Columbia County",  state: "GA", counties: ["Columbia"],  zoneNote: "Evans, Grovetown, Harlem, Martinez",                 households: 55000,  status: "available" },
  { id: "GA-040", name: "Lowndes County",   state: "GA", counties: ["Lowndes"],   zoneNote: "Valdosta, Hahira, Lake Park, Remerton",              households: 45000,  status: "available" },
  { id: "GA-041", name: "Bulloch County",   state: "GA", counties: ["Bulloch"],   zoneNote: "Statesboro, Brooklet, Portal, Register",             households: 32000,  status: "available" },
  { id: "GA-042", name: "Effingham County", state: "GA", counties: ["Effingham"], zoneNote: "Springfield, Guyton, Rincon, Pooler area",           households: 30000,  status: "available" },
  { id: "GA-043", name: "Glynn County",     state: "GA", counties: ["Glynn"],     zoneNote: "Brunswick, St. Simons Island, Jekyll Island",        households: 48000,  status: "available" },
  { id: "GA-044", name: "Tift County",      state: "GA", counties: ["Tift"],      zoneNote: "Tifton, Omega, Ty Ty",                               households: 28000,  status: "available" },
  { id: "GA-045", name: "Coffee County",    state: "GA", counties: ["Coffee"],    zoneNote: "Douglas, Nicholls, Broxton, Ambrose",                households: 34000,  status: "available" },
  { id: "GA-046", name: "Troup County",     state: "GA", counties: ["Troup"],     zoneNote: "LaGrange, West Point, Hogansville",                  households: 28000,  status: "available" },

  // ── TIER 3 — COMBINED COUNTIES (Northeast Georgia Mountains) ─────────────────
  { id: "GA-047", name: "White / Habersham Counties",          state: "GA", counties: ["White", "Habersham"],                          zoneNote: "Cleveland, Helen, Clarkesville, Cornelia, Demorest",           households: 28000, status: "available" },
  { id: "GA-048", name: "Stephens / Franklin / Hart Counties", state: "GA", counties: ["Stephens", "Franklin", "Hart"],                zoneNote: "Toccoa, Carnesville, Hartwell",                                households: 30000, status: "available" },
  { id: "GA-049", name: "Rabun / Towns / Union Counties",      state: "GA", counties: ["Rabun", "Towns", "Union"],                     zoneNote: "Clayton, Hiawassee, Blairsville",                              households: 22000, status: "available" },
  { id: "GA-050", name: "Fannin / Gilmer Counties",            state: "GA", counties: ["Fannin", "Gilmer"],                            zoneNote: "Blue Ridge, Ellijay",                                          households: 28000, status: "available" },
  { id: "GA-051", name: "Pickens / Dawson Counties",           state: "GA", counties: ["Pickens", "Dawson"],                           zoneNote: "Jasper, Dawsonville",                                          households: 24000, status: "available" },
  { id: "GA-052", name: "Lumpkin / Dawson Counties",           state: "GA", counties: ["Lumpkin", "Dawson"],                           zoneNote: "Dahlonega, Dawsonville",                                       households: 22000, status: "available" },
  { id: "GA-053", name: "Murray / Gordon Counties",            state: "GA", counties: ["Murray", "Gordon"],                            zoneNote: "Chatsworth, Calhoun, Resaca",                                  households: 34000, status: "available" },
  { id: "GA-054", name: "Haralson / Polk Counties",            state: "GA", counties: ["Haralson", "Polk"],                            zoneNote: "Buchanan, Bremen, Cedartown, Rockmart",                        households: 26000, status: "available" },

  // ── TIER 3 — COMBINED COUNTIES (Northeast Georgia) ───────────────────────────
  { id: "GA-055", name: "Madison / Oglethorpe Counties",       state: "GA", counties: ["Madison", "Oglethorpe"],                       zoneNote: "Danielsville, Lexington",                                     households: 20000, status: "available" },
  { id: "GA-056", name: "Banks / Franklin Counties",           state: "GA", counties: ["Banks", "Franklin"],                           zoneNote: "Homer, Lavonia, Canon, Royston",                               households: 20000, status: "available" },
  { id: "GA-057", name: "Oconee / Greene Counties",            state: "GA", counties: ["Oconee", "Greene"],                            zoneNote: "Watkinsville, Greensboro, Union Point",                        households: 30000, status: "available" },
  { id: "GA-058", name: "Morgan / Putnam Counties",            state: "GA", counties: ["Morgan", "Putnam"],                            zoneNote: "Madison, Eatonton",                                            households: 22000, status: "available" },
  { id: "GA-059", name: "Jasper / Jones Counties",             state: "GA", counties: ["Jasper", "Jones"],                             zoneNote: "Monticello, Gray, Juliette",                                   households: 20000, status: "available" },
  { id: "GA-060", name: "McDuffie / Warren / Jefferson",       state: "GA", counties: ["McDuffie", "Warren", "Jefferson"],             zoneNote: "Thomson, Warrenton, Louisville",                               households: 24000, status: "available" },
  { id: "GA-061", name: "Wilkes / Lincoln / Taliaferro / Glascock", state: "GA", counties: ["Wilkes", "Lincoln", "Taliaferro", "Glascock"], zoneNote: "Washington, Lincolnton, Crawfordville, Gibson",           households: 18000, status: "available" },

  // ── TIER 3 — COMBINED COUNTIES (Atlanta south / west) ────────────────────────
  { id: "GA-062", name: "Pike / Lamar / Upson Counties",       state: "GA", counties: ["Pike", "Lamar", "Upson"],                      zoneNote: "Zebulon, Barnesville, Thomaston",                             households: 28000, status: "available" },
  { id: "GA-063", name: "Monroe / Butts Counties",             state: "GA", counties: ["Monroe", "Butts"],                             zoneNote: "Forsyth, Jackson",                                             households: 26000, status: "available" },
  { id: "GA-064", name: "Harris County",                       state: "GA", counties: ["Harris"],                                      zoneNote: "Hamilton, Pine Mountain, Waverly Hall",                        households: 20000, status: "available" },
  { id: "GA-065", name: "Heard / Meriwether / Talbot Counties",state: "GA", counties: ["Heard", "Meriwether", "Talbot"],               zoneNote: "Franklin, Greenville, Warm Springs, Talbotton",               households: 20000, status: "available" },

  // ── TIER 3 — COMBINED COUNTIES (Coastal Georgia) ─────────────────────────────
  { id: "GA-066", name: "Bryan / Liberty Counties",            state: "GA", counties: ["Bryan", "Liberty"],                            zoneNote: "Richmond Hill, Pemberton, Hinesville, Midway",                households: 42000, status: "available" },
  { id: "GA-067", name: "Camden County",                       state: "GA", counties: ["Camden"],                                      zoneNote: "Kingsland, St. Marys, Woodbine",                               households: 24000, status: "available" },
  { id: "GA-068", name: "Long / McIntosh / Charlton Counties", state: "GA", counties: ["Long", "McIntosh", "Charlton"],                zoneNote: "Ludowici, Darien, Folkston",                                   households: 20000, status: "available" },

  // ── TIER 3 — COMBINED COUNTIES (Central Georgia) ─────────────────────────────
  { id: "GA-069", name: "Peach / Crawford Counties",           state: "GA", counties: ["Peach", "Crawford"],                           zoneNote: "Fort Valley, Roberta, Byron area",                             households: 22000, status: "available" },
  { id: "GA-070", name: "Baldwin / Johnson / Washington / Hancock", state: "GA", counties: ["Baldwin", "Johnson", "Washington", "Hancock"], zoneNote: "Milledgeville, Wrightsville, Sandersville, Sparta",       households: 36000, status: "available" },
  { id: "GA-071", name: "Twiggs / Bleckley / Laurens Counties",state: "GA", counties: ["Twiggs", "Bleckley", "Laurens"],               zoneNote: "Jeffersonville, Cochran, Dublin",                              households: 28000, status: "available" },
  { id: "GA-072", name: "Dooly / Crisp Counties",              state: "GA", counties: ["Dooly", "Crisp"],                              zoneNote: "Vienna, Cordele",                                              households: 22000, status: "available" },
  { id: "GA-073", name: "Dodge / Montgomery / Telfair Counties",state: "GA", counties: ["Dodge", "Montgomery", "Telfair"],             zoneNote: "Eastman, Mount Vernon, McRae-Helena",                          households: 22000, status: "available" },
  { id: "GA-074", name: "Wheeler / Treutlen / Toombs Counties",state: "GA", counties: ["Wheeler", "Treutlen", "Toombs"],               zoneNote: "Alamo, Soperton, Lyons, Vidalia",                              households: 22000, status: "available" },
  { id: "GA-075", name: "Wilcox / Pulaski / Wilkinson Counties",state: "GA", counties: ["Wilcox", "Pulaski", "Wilkinson"],             zoneNote: "Rochelle, Hawkinsville, Irwinton",                             households: 20000, status: "available" },
  { id: "GA-076", name: "Macon / Taylor / Marion / Schley Counties", state: "GA", counties: ["Macon", "Taylor", "Marion", "Schley"],  zoneNote: "Oglethorpe, Butler, Buena Vista, Ellaville",                  households: 18000, status: "available" },

  // ── TIER 3 — COMBINED COUNTIES (Southwest Georgia) ───────────────────────────
  { id: "GA-077", name: "Baker / Dougherty Counties",          state: "GA", counties: ["Baker", "Dougherty"],                          zoneNote: "Albany, Newton, Leesburg",                                     households: 37000, status: "available" },
  { id: "GA-078", name: "Sumter / Schley Counties",            state: "GA", counties: ["Sumter", "Schley"],                            zoneNote: "Americus, Ellaville",                                          households: 24000, status: "available" },
  { id: "GA-079", name: "Terrell / Lee Counties",              state: "GA", counties: ["Terrell", "Lee"],                              zoneNote: "Dawson, Leesburg, Smithville",                                  households: 20000, status: "available" },
  { id: "GA-080", name: "Randolph / Calhoun / Clay / Quitman", state: "GA", counties: ["Randolph", "Calhoun", "Clay", "Quitman"],     zoneNote: "Cuthbert, Morgan, Fort Gaines, Georgetown",                    households: 14000, status: "available" },
  { id: "GA-081", name: "Stewart / Webster / Chattahoochee",   state: "GA", counties: ["Stewart", "Webster", "Chattahoochee"],         zoneNote: "Lumpkin, Preston, Cusseta",                                    households: 12000, status: "available" },
  { id: "GA-082", name: "Early / Seminole / Miller Counties",  state: "GA", counties: ["Early", "Seminole", "Miller"],                 zoneNote: "Blakely, Donalsonville, Colquitt",                             households: 22000, status: "available" },
  { id: "GA-083", name: "Decatur County",                      state: "GA", counties: ["Decatur"],                                     zoneNote: "Bainbridge, Attapulgus, Climax",                               households: 22000, status: "available" },
  { id: "GA-084", name: "Mitchell / Colquitt Counties",        state: "GA", counties: ["Mitchell", "Colquitt"],                        zoneNote: "Camilla, Moultrie, Berlin",                                    households: 34000, status: "available" },
  { id: "GA-085", name: "Worth / Turner Counties",             state: "GA", counties: ["Worth", "Turner"],                             zoneNote: "Sylvester, Ashburn, Isabella",                                 households: 22000, status: "available" },
  { id: "GA-086", name: "Thomas / Brooks / Grady Counties",    state: "GA", counties: ["Thomas", "Brooks", "Grady"],                   zoneNote: "Thomasville, Quitman, Cairo",                                  households: 46000, status: "available" },

  // ── TIER 3 — COMBINED COUNTIES (South Central / Southeast Georgia) ───────────
  { id: "GA-087", name: "Ben Hill / Irwin / Berrien Counties", state: "GA", counties: ["Ben Hill", "Irwin", "Berrien"],                zoneNote: "Fitzgerald, Ocilla, Nashville",                                households: 28000, status: "available" },
  { id: "GA-088", name: "Cook / Atkinson / Lanier Counties",   state: "GA", counties: ["Cook", "Atkinson", "Lanier"],                  zoneNote: "Adel, Pearson, Lakeland",                                      households: 20000, status: "available" },
  { id: "GA-089", name: "Echols / Clinch Counties",            state: "GA", counties: ["Echols", "Clinch"],                            zoneNote: "Statenville, Homerville",                                      households: 12000, status: "available" },
  { id: "GA-090", name: "Emanuel / Candler Counties",          state: "GA", counties: ["Emanuel", "Candler"],                          zoneNote: "Swainsboro, Metter",                                           households: 20000, status: "available" },
  { id: "GA-091", name: "Screven / Jenkins Counties",          state: "GA", counties: ["Screven", "Jenkins"],                          zoneNote: "Sylvania, Millen",                                             households: 16000, status: "available" },
  { id: "GA-092", name: "Evans / Tattnall Counties",           state: "GA", counties: ["Evans", "Tattnall"],                           zoneNote: "Claxton, Reidsville, Collins",                                  households: 20000, status: "available" },
  { id: "GA-093", name: "Appling / Jeff Davis Counties",       state: "GA", counties: ["Appling", "Jeff Davis"],                       zoneNote: "Baxley, Hazlehurst",                                           households: 22000, status: "available" },
  { id: "GA-094", name: "Wayne / Brantley Counties",           state: "GA", counties: ["Wayne", "Brantley"],                           zoneNote: "Jesup, Nahunta, Odum",                                         households: 20000, status: "available" },
  { id: "GA-095", name: "Ware / Pierce / Bacon Counties",      state: "GA", counties: ["Ware", "Pierce", "Bacon"],                     zoneNote: "Waycross, Blackshear, Alma",                                   households: 28000, status: "available" },
];
