export const FREE_TIER_INSTANCE_TYPES = [
  "t3.micro",
  "t3.small",
];

export const INSTANCE_TYPE = process.env.AWS_INSTANCE_TYPE || "t3.micro";

export function validateFreeTierInstanceType(instanceType) {
  if (!FREE_TIER_INSTANCE_TYPES.includes(instanceType)) {
    throw new Error(
      `Invalid instance type: ${instanceType}. Only t3.micro and t3.small are allowed.`
    );
  }

  return instanceType;
}

export function getConfiguredInstanceType(instanceType = INSTANCE_TYPE) {
  return validateFreeTierInstanceType(instanceType);
}

export function logEC2Launch(instanceType, region) {
  console.log("Launching EC2 with:", {
    instanceType,
    region: region || process.env.AWS_DEFAULT_REGION,
  });
}

export function getAwsErrorResponse(error) {
  return {
    name: error?.name,
    code: error?.code || error?.Code || error?.__type,
    message: error?.message,
    requestId: error?.$metadata?.requestId || error?.RequestId,
    statusCode: error?.$metadata?.httpStatusCode || error?.statusCode,
    retryable: error?.$retryable,
  };
}
