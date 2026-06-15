/**
 * AWS Regions Configuration
 * Separates region display labels from region codes
 */

export const AWS_REGIONS = [
  // US Regions
  { label: "N. Virginia (us-east-1)", value: "us-east-1", displayName: "N. Virginia" },
  { label: "Ohio (us-east-2)", value: "us-east-2", displayName: "Ohio" },
  { label: "N. California (us-west-1)", value: "us-west-1", displayName: "N. California" },
  { label: "Oregon (us-west-2)", value: "us-west-2", displayName: "Oregon" },

  // Europe Regions
  { label: "Ireland (eu-west-1)", value: "eu-west-1", displayName: "Ireland" },
  { label: "Frankfurt (eu-central-1)", value: "eu-central-1", displayName: "Frankfurt" },
  { label: "London (eu-west-2)", value: "eu-west-2", displayName: "London" },
  { label: "Paris (eu-west-3)", value: "eu-west-3", displayName: "Paris" },

  // Asia Pacific Regions
  { label: "Mumbai (ap-south-1)", value: "ap-south-1", displayName: "Mumbai" },
  { label: "Singapore (ap-southeast-1)", value: "ap-southeast-1", displayName: "Singapore" },
  { label: "Sydney (ap-southeast-2)", value: "ap-southeast-2", displayName: "Sydney" },
  { label: "Tokyo (ap-northeast-1)", value: "ap-northeast-1", displayName: "Tokyo" },
  { label: "Seoul (ap-northeast-2)", value: "ap-northeast-2", displayName: "Seoul" },

  // Canada
  { label: "Canada (ca-central-1)", value: "ca-central-1", displayName: "Canada" },

  // South America
  { label: "São Paulo (sa-east-1)", value: "sa-east-1", displayName: "São Paulo" },
];

/**
 * Validate if a region code is valid
 */
export function isValidRegionCode(code) {
  return AWS_REGIONS.some((region) => region.value === code);
}

/**
 * Get region label from code
 */
export function getRegionLabel(code) {
  const region = AWS_REGIONS.find((r) => r.value === code);
  return region ? region.displayName : code;
}

/**
 * Get full region label (Name - Code)
 */
export function getFullRegionLabel(code) {
  const region = AWS_REGIONS.find((r) => r.value === code);
  return region ? region.label : code;
}

/**
 * Get region code from label (if needed)
 */
export function getRegionCode(label) {
  // Handle both full label and display name
  const region = AWS_REGIONS.find(
    (r) => r.label === label || r.displayName === label || r.value === label
  );
  return region ? region.value : label;
}

export default AWS_REGIONS;
