/**
 * Which state and city pages /mssp gets. Every country with enough companies (MIN_COUNTRY) gets a page. A place not listed here has no page of
 * its own: its companies stay on the country page and in the directory. Format: [country, place name as in the sheet].
 * A listed place with no company in the sheet is skipped.
 */
const STATES = [
  ["United States", "California"],
  ["United States", "Texas"],
  ["United States", "Florida"],
  ["United States", "Virginia"],
  ["United States", "New York"],
  ["United States", "Maryland"],
  ["Canada", "Ontario"],
  ["Australia", "New South Wales"],
  ["Australia", "Victoria"],
  ["United Kingdom", "England"],
  ["France", "Ile-de-France"],
];

const CITIES = [
  ["United States", "Houston"],
  ["United States", "Washington"],
  ["United States", "Austin"],
  ["United States", "Tampa"],
  ["United States", "Dallas"],
  ["United States", "Chicago"],
  ["United States", "Los Angeles"],
  ["United States", "Atlanta"],
  ["United States", "San Francisco"],
  ["United States", "Miami"],
  ["United Kingdom", "London"],
  ["Canada", "Toronto"],
  ["Canada", "Montreal"],
  ["Canada", "Vancouver"],
  ["Canada", "Ottawa"],
  ["Australia", "Sydney"],
  ["Australia", "Melbourne"],
  ["France", "Paris"],
  ["Ireland", "Dublin"],
  ["Netherlands", "Amsterdam"],
  ["Spain", "Madrid"],
  ["Germany", "Munich"],
];

// A country needs at least this many companies to get a page. Smaller countries stay in the directory (country filter).
const MIN_COUNTRY = 5;

module.exports = { STATES, CITIES, MIN_COUNTRY };
