/**
 * Which master-sheet companies belong on which page.
 *
 *  - State page   : every company whose Company State equals the state.
 *  - Country page : every company whose Company Country equals the country.
 *  - City page    : companies in that exact city (and state), see CITY_RULES.
 *
 * Keys of CITY_RULES are the page slugs on /msp/{slug}.
 *   state  : the state / province the city is in (stops Portland ME mixing with Portland OR)
 *   cities : city names as written in the sheet (St. Louis and Saint Louis are normalised alike)
 *   region : true  = the page IS a list of cities (Orange County, Western New York), so `cities` always apply
 *   metro  : nearby suburbs. Only used when METRO_ENABLED is true (or MASTER_METRO=1 in .env).
 *            Write "City|State" when the suburb is in another state (Arlington|Virginia for Washington DC).
 */

const METRO_ENABLED = process.env.MASTER_METRO === "1";

const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware",
  "District of Columbia", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas",
  "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi",
  "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico", "New York",
  "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island",
  "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington",
  "West Virginia", "Wisconsin", "Wyoming",
];

// Country names that may be typed differently on a country page.
const COUNTRY_ALIASES = {
  uk: "United Kingdom",
  "great britain": "United Kingdom",
  england: "United Kingdom",
  usa: "United States",
  us: "United States",
  america: "United States",
  "united states of america": "United States",
  holland: "Netherlands",
  deutschland: "Germany",
};

const CITY_RULES = {
  atlanta: { state: "Georgia", cities: ["Atlanta"] },
  austin: { state: "Texas", cities: ["Austin"] },
  baltimore: { state: "Maryland", cities: ["Baltimore"] },
  boston: { state: "Massachusetts", cities: ["Boston"], metro: ["Cambridge", "Somerville", "Quincy", "Waltham", "Burlington", "Woburn", "Framingham", "Newton", "Braintree", "Lexington", "Needham", "Acton", "Southborough", "Foxborough"] },
  calgary: { state: "Alberta", cities: ["Calgary"] },
  edmonton: { state: "Alberta", cities: ["Edmonton"] },
  "spruce-grove": { state: "Alberta", cities: ["Spruce Grove"] },
  "stony-plain": { state: "Alberta", cities: ["Stony Plain"] },
  charlotte: { state: "North Carolina", cities: ["Charlotte"] },
  chicago: { state: "Illinois", cities: ["Chicago"] },
  cincinnati: { state: "Ohio", cities: ["Cincinnati"] },
  cleveland: { state: "Ohio", cities: ["Cleveland"], metro: ["Beachwood", "Independence", "Strongsville", "Parma", "Solon", "Westlake", "Mayfield Heights", "Rocky River", "Middleburg Heights", "Brecksville", "Richmond Heights", "Avon"] },
  columbus: { state: "Ohio", cities: ["Columbus"], metro: ["Dublin", "Westerville", "Worthington", "Hilliard", "Gahanna", "Grove City", "New Albany", "Powell", "Reynoldsburg", "Galena"] },
  dallas: { state: "Texas", cities: ["Dallas"], metro: ["Plano", "Allen", "Carrollton", "Addison", "Frisco", "McKinney", "Grand Prairie", "Mesquite", "Keller", "Bedford", "Fort Worth", "Irving", "Richardson", "Garland", "Arlington"] },
  denver: { state: "Colorado", cities: ["Denver"] },
  detroit: { state: "Michigan", cities: ["Detroit"] },
  fresno: { state: "California", cities: ["Fresno"] },
  houston: { state: "Texas", cities: ["Houston"], metro: ["Katy", "Sugar Land", "Spring", "Missouri City", "Bellaire", "The Woodlands", "Pearland", "Humble", "Cypress", "Stafford"] },
  indianapolis: { state: "Indiana", cities: ["Indianapolis"] },
  jacksonville: { state: "Florida", cities: ["Jacksonville"] },
  "las-vegas": { state: "Nevada", cities: ["Las Vegas"], metro: ["Henderson", "North Las Vegas"] },
  "los-angeles": { state: "California", cities: ["Los Angeles"] },
  melbourne: { state: "Victoria", cities: ["Melbourne"] },
  memphis: { state: "Tennessee", cities: ["Memphis"] },
  miami: { state: "Florida", cities: ["Miami"] },
  minneapolis: { state: "Minnesota", cities: ["Minneapolis"], metro: ["St. Paul", "Bloomington", "Eden Prairie", "Minnetonka", "Plymouth", "Eagan", "Maple Grove", "Burnsville", "Edina", "Roseville", "Coon Rapids", "New Hope", "St. Louis Park", "Arden Hills", "Brooklyn Park", "Anoka"] },
  nashville: { state: "Tennessee", cities: ["Nashville"], metro: ["Franklin", "Brentwood", "Murfreesboro", "Hendersonville", "Smyrna", "Lebanon", "Mt. Juliet", "Gallatin", "Hermitage"] },
  "new-orleans": { state: "Louisiana", cities: ["New Orleans"], metro: ["Metairie", "Kenner", "Harahan", "Gretna", "Slidell", "Covington", "Mandeville", "Marrero"] },
  "new-york": { state: "New York", cities: ["New York"] },
  "oklahoma-city": { state: "Oklahoma", cities: ["Oklahoma City"] },
  omaha: { state: "Nebraska", cities: ["Omaha"] },
  "orange-county": { state: "California", region: true, cities: ["Irvine", "Anaheim", "Santa Ana", "Costa Mesa", "Newport Beach", "Huntington Beach", "Fullerton", "Orange", "Tustin", "Lake Forest", "Laguna Hills", "Aliso Viejo", "Mission Viejo", "Laguna Niguel", "San Clemente", "Cypress", "Los Alamitos", "Garden Grove", "Brea", "Yorba Linda", "Buena Park", "Placentia", "Seal Beach", "Dana Point", "Fountain Valley", "Westminster"] },
  orlando: { state: "Florida", cities: ["Orlando"] },
  philadelphia: { state: "Pennsylvania", cities: ["Philadelphia"], metro: ["King of Prussia", "Conshohocken", "Malvern", "Bensalem", "Blue Bell", "Plymouth Meeting", "Wayne", "Bala Cynwyd", "Horsham", "Exton", "Newtown Square", "Havertown", "Huntingdon Valley", "Feasterville-Trevose", "Essington", "Devon", "Chester Springs"] },
  phoenix: { state: "Arizona", cities: ["Phoenix"], metro: ["Scottsdale", "Mesa", "Chandler", "Tempe", "Gilbert", "Glendale"] },
  pittsburgh: { state: "Pennsylvania", cities: ["Pittsburgh"] },
  portland: { state: "Oregon", cities: ["Portland"] },
  raleigh: { state: "North Carolina", cities: ["Raleigh"] },
  richmond: { state: "Virginia", cities: ["Richmond"] },
  sacramento: { state: "California", cities: ["Sacramento"] },
  "salt-lake-city": { state: "Utah", cities: ["Salt Lake City"], metro: ["Murray", "Sandy", "Draper", "South Jordan", "West Valley City", "Lehi", "Midvale", "Bountiful", "Ogden", "Provo", "Orem", "Kaysville", "American Fork"] },
  "san-antonio": { state: "Texas", cities: ["San Antonio"] },
  "san-diego": { state: "California", cities: ["San Diego"] },
  "san-francisco": { state: "California", cities: ["San Francisco"] },
  seattle: { state: "Washington", cities: ["Seattle"] },
  sydney: { state: "New South Wales", cities: ["Sydney"] },
  tampa: { state: "Florida", cities: ["Tampa"] },
  toronto: { state: "Ontario", cities: ["Toronto"] },
  tucson: { state: "Arizona", cities: ["Tucson"] },
  vancouver: { state: "British Columbia", cities: ["Vancouver"] },
  "virginia-beach": { state: "Virginia", cities: ["Virginia Beach"] },
  "washington-dc": { state: "District of Columbia", cities: ["Washington", "Washington DC"], metro: ["Arlington|Virginia", "Alexandria|Virginia", "Reston|Virginia", "Tysons|Virginia", "Fairfax|Virginia", "Herndon|Virginia", "Bethesda|Maryland", "Rockville|Maryland", "Silver Spring|Maryland", "Columbia|Maryland"] },
  "western-new-york": { state: "New York", region: true, cities: ["Buffalo", "Rochester", "Syracuse", "Niagara Falls", "Amherst", "Cheektowaga", "Tonawanda", "Lockport", "Jamestown", "Orchard Park", "Williamsville", "Batavia", "Fredonia", "Olean"] },
  wichita: { state: "Kansas", cities: ["Wichita"] },
};

module.exports = { METRO_ENABLED, US_STATES, COUNTRY_ALIASES, CITY_RULES };
