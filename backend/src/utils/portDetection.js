const PORT_MIN = 1;
const PORT_MAX = 65535;

function toValidPort(value) {
  const port = Number.parseInt(value, 10);
  return Number.isInteger(port) && port >= PORT_MIN && port <= PORT_MAX ? port : null;
}

function firstValidPort(matches) {
  for (const match of matches) {
    const port = toValidPort(match);
    if (port) return port;
  }
  return null;
}

export function detectPortFromDockerfile(content) {
  if (!content) return null;

  const exposeMatches = [...String(content).matchAll(/^\s*EXPOSE\s+(\d+)/gim)].map((match) => match[1]);
  const exposedPort = firstValidPort(exposeMatches);
  if (exposedPort) return exposedPort;

  const envPortMatches = [...String(content).matchAll(/^\s*(?:ENV|ARG)\s+PORT[=\s]+(\d+)/gim)].map((match) => match[1]);
  return firstValidPort(envPortMatches);
}

export function detectPortFromCompose(content) {
  if (!content) return null;

  const text = String(content);
  const mappingMatches = [
    ...text.matchAll(/["']?\d+\s*:\s*(\d+)["']?/g),
    ...text.matchAll(/target:\s*(\d+)/gi),
    ...text.matchAll(/targetPort:\s*(\d+)/gi),
  ].map((match) => match[1]);

  return firstValidPort(mappingMatches);
}

export function detectPortFromSource(content) {
  if (!content) return null;

  const text = String(content);
  const matches = [
    ...text.matchAll(/(?:const|let|var)\s+\w*port\w*\s*=\s*(?:process\.env\.PORT\s*(?:\|\||\?\?)\s*)?(\d+)/gi),
    ...text.matchAll(/\bport\s*=\s*(?:process\.env\.PORT\s*(?:\|\||\?\?)\s*)?(\d+)/gi),
    ...text.matchAll(/process\.env\.PORT\s*(?:\|\||\?\?)\s*(\d+)/gi),
    ...text.matchAll(/\.listen\(\s*(\d+)/gi),
    ...text.matchAll(/listen\s*:\s*(\d+)/gi),
  ].map((match) => match[1]);

  return firstValidPort(matches);
}

export function detectApplicationPort(files = {}, fallbackPort = 3000) {
  const dockerfilePort = detectPortFromDockerfile(files.dockerfile);
  if (dockerfilePort) {
    return { port: dockerfilePort, source: "Dockerfile" };
  }

  const composePort = detectPortFromCompose(files.dockerCompose);
  if (composePort) {
    return { port: composePort, source: "docker-compose" };
  }

  const sourceFiles = files.sourceFiles || {};
  for (const [filePath, content] of Object.entries(sourceFiles)) {
    const sourcePort = detectPortFromSource(content);
    if (sourcePort) {
      return { port: sourcePort, source: filePath };
    }
  }

  return { port: toValidPort(fallbackPort) || 3000, source: "default" };
}
