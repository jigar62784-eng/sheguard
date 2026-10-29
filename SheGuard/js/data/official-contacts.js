/**
 * official-contacts.js — nationally published Indian emergency numbers.
 * These are static reference data (not fetched). Confirm any number on the official
 * source before relying on it; each entry links to that source.
 *   112  — ERSS single emergency number     https://112.gov.in/
 *   1930 — National Cyber Crime Helpline     https://cybercrime.gov.in/
 * Other numbers are widely published by the Government of India / Ministry of Women & Child Development.
 * SheGuard does NOT guarantee availability in every state/district; local numbers can differ.
 */
export const officialContacts = [
  { number: "112",  label: "National emergency number (police, fire, ambulance)", source: "https://112.gov.in/" },
  { number: "100",  label: "Police (legacy number, many states route to 112)", source: "https://112.gov.in/" },
  { number: "1091", label: "Women helpline (police)", source: "https://wcd.gov.in/" },
  { number: "181",  label: "Women helpline (Ministry of Women & Child Development scheme)", source: "https://wcd.gov.in/" },
  { number: "1930", label: "Cyber crime helpline", source: "https://cybercrime.gov.in/" },
  { number: "108",  label: "Ambulance (state-run in most states)", source: "https://nhm.gov.in/" }
];
