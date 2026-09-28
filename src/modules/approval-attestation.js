const crypto = require("crypto");

const APPROVAL_ATTESTATION_PREFIX = "<!-- publish-approval ";
const AUTO_APPROVAL_ATTESTATION_PREFIX = "<!-- publish-auto-approval ";
const CI_READY_ATTESTATION_PREFIX = "<!-- publish-ci-ready ";
const ATTESTATION_SUFFIX = " -->";

function createAttestation(prefix, value) {
  const secret = process.env.PUBLISH_ATTESTATION_SECRET;

  if (!secret) {
    throw new Error("No PUBLISH_ATTESTATION_SECRET configured");
  }

  const signature = crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(value))
    .digest("base64url");

  return `${prefix}${Buffer.from(
    JSON.stringify({ ...value, signature })
  ).toString("base64url")}${ATTESTATION_SUFFIX}`;
}

function requestDigest({ body, labels, title }) {
  if (
    typeof body !== "string" ||
    !Array.isArray(labels) ||
    typeof title !== "string"
  ) {
    throw new Error("Invalid publish request");
  }

  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        body,
        dryRun: labels.some((label) => label.name === "dry-run"),
        title,
      })
    )
    .digest("hex");
}

function createApprovalAttestation({ actor, eventId, issue }) {
  return createAttestation(APPROVAL_ATTESTATION_PREFIX, {
    actor,
    eventId: String(eventId),
    requestDigest: requestDigest(issue),
    title: issue.title,
  });
}

function createAutoApprovalAttestation({ acceptedEvent, autoApprover, issue }) {
  return createAttestation(AUTO_APPROVAL_ATTESTATION_PREFIX, {
    acceptedActor: acceptedEvent.actor,
    acceptedEventId: String(acceptedEvent.eventId),
    autoApprover,
    requestDigest: requestDigest(issue),
    title: issue.title,
  });
}

function createCiReadyAttestation({ acceptedEvent, ciReadyEvent, issue }) {
  return createAttestation(CI_READY_ATTESTATION_PREFIX, {
    acceptedActor: acceptedEvent.actor,
    acceptedEventId: String(acceptedEvent.eventId),
    ciReadyActor: ciReadyEvent.actor,
    ciReadyEventId: String(ciReadyEvent.eventId),
    requestDigest: requestDigest(issue),
    title: issue.title,
  });
}

function parseAttestation(body, prefix) {
  const start = body.indexOf(prefix);

  if (start === -1) {
    return null;
  }

  const end = body.indexOf(ATTESTATION_SUFFIX, start);

  if (end === -1) {
    return null;
  }

  try {
    const value = JSON.parse(
      Buffer.from(body.slice(start + prefix.length, end), "base64url").toString(
        "utf8"
      )
    );

    return value;
  } catch {
    return null;
  }
}

function parseApprovalAttestation(body) {
  const value = parseAttestation(body, APPROVAL_ATTESTATION_PREFIX);

  if (
    typeof value?.actor !== "string" ||
    typeof value.eventId !== "string" ||
    typeof value.requestDigest !== "string" ||
    typeof value.title !== "string" ||
    typeof value.signature !== "string"
  ) {
    return null;
  }

  return value;
}

function parseAutoApprovalAttestation(body) {
  const value = parseAttestation(body, AUTO_APPROVAL_ATTESTATION_PREFIX);

  if (
    typeof value?.acceptedActor !== "string" ||
    typeof value.acceptedEventId !== "string" ||
    typeof value?.autoApprover !== "string" ||
    typeof value.requestDigest !== "string" ||
    typeof value.title !== "string" ||
    typeof value.signature !== "string"
  ) {
    return null;
  }

  return value;
}

function parseCiReadyAttestation(body) {
  const value = parseAttestation(body, CI_READY_ATTESTATION_PREFIX);

  if (
    typeof value?.acceptedActor !== "string" ||
    typeof value.acceptedEventId !== "string" ||
    typeof value.ciReadyActor !== "string" ||
    typeof value.ciReadyEventId !== "string" ||
    typeof value.requestDigest !== "string" ||
    typeof value.title !== "string" ||
    typeof value.signature !== "string"
  ) {
    return null;
  }

  return value;
}

function compareEventIds(left, right) {
  if (
    (typeof left === "number" && !Number.isSafeInteger(left)) ||
    (typeof right === "number" && !Number.isSafeInteger(right))
  ) {
    throw new Error("Invalid issue event ID");
  }

  const normalizedLeft = String(left).replace(/^0+/, "") || "0";
  const normalizedRight = String(right).replace(/^0+/, "") || "0";

  if (!/^\d+$/.test(normalizedLeft) || !/^\d+$/.test(normalizedRight)) {
    throw new Error("Invalid issue event ID");
  }

  if (normalizedLeft.length !== normalizedRight.length) {
    return normalizedLeft.length - normalizedRight.length;
  }

  return normalizedLeft.localeCompare(normalizedRight);
}

function currentLabeledEvent(events, labelName) {
  const labelEvents = events.filter(
    (event) =>
      (event.event === "labeled" || event.event === "unlabeled") &&
      event.label?.name === labelName
  );

  if (labelEvents.length === 0) {
    return null;
  }

  try {
    for (const event of labelEvents) {
      compareEventIds(event.id, event.id);
    }

    const event = labelEvents.reduce((latest, candidate) =>
      compareEventIds(candidate.id, latest.id) > 0 ? candidate : latest
    );

    if (
      event.event !== "labeled" ||
      typeof event.actor?.login !== "string" ||
      !event.actor.login
    ) {
      return null;
    }

    return { actor: event.actor.login, eventId: String(event.id) };
  } catch {
    return null;
  }
}

function currentAcceptedEvent(events) {
  return currentLabeledEvent(events, "accepted");
}

function currentCiReadyEvent(events) {
  return currentLabeledEvent(events, "ci-ready");
}

function hasIssueStateChangeAfter(events, referenceEvent) {
  try {
    return events.some(
      (event) =>
        (event.event === "closed" || event.event === "reopened") &&
        compareEventIds(event.id, referenceEvent.eventId) > 0
    );
  } catch {
    return true;
  }
}

function hasValidSignature(
  attestation,
  attestationSecret = process.env.PUBLISH_ATTESTATION_SECRET
) {
  const secret = attestationSecret;

  if (!secret || typeof attestation?.signature !== "string") {
    return false;
  }

  const { signature, ...value } = attestation;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(value))
    .digest("base64url");

  try {
    const actualBuffer = Buffer.from(signature, "base64url");
    const expectedBuffer = Buffer.from(expected, "base64url");

    return (
      actualBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(actualBuffer, expectedBuffer)
    );
  } catch {
    return false;
  }
}

function hasApprovalAttestation({
  attestationAuthor,
  attestationSecret,
  comments,
  event,
  issue,
}) {
  const digest = requestDigest(issue);

  return comments.some((comment) => {
    if (comment.user?.login !== attestationAuthor) {
      return false;
    }

    const attestation = parseApprovalAttestation(comment.body);

    return (
      attestation?.actor === event.actor &&
      attestation.eventId === event.eventId &&
      attestation.requestDigest === digest &&
      attestation.title === issue.title &&
      hasValidSignature(attestation, attestationSecret)
    );
  });
}

function hasAutoApprovalAttestation({
  acceptedEvent,
  autoApprover,
  attestationSecret,
  attestationAuthor,
  comments,
  issue,
}) {
  const digest = requestDigest(issue);

  return comments.some((comment) => {
    if (comment.user?.login !== attestationAuthor) {
      return false;
    }

    const attestation = parseAutoApprovalAttestation(comment.body);

    return (
      attestation?.acceptedActor === acceptedEvent.actor &&
      attestation.acceptedEventId === acceptedEvent.eventId &&
      attestation?.autoApprover === autoApprover &&
      attestation.requestDigest === digest &&
      attestation.title === issue.title &&
      hasValidSignature(attestation, attestationSecret)
    );
  });
}

function hasCiReadyAttestation({
  comments,
  acceptedEvent,
  ciReadyEvent,
  issue,
  attestationSecret,
  attestationAuthor,
}) {
  const digest = requestDigest(issue);

  return comments.some((comment) => {
    if (comment.user?.login !== attestationAuthor) {
      return false;
    }

    const attestation = parseCiReadyAttestation(comment.body);

    return (
      attestation?.acceptedActor === acceptedEvent.actor &&
      attestation.acceptedEventId === acceptedEvent.eventId &&
      attestation.ciReadyActor === ciReadyEvent.actor &&
      attestation.ciReadyEventId === ciReadyEvent.eventId &&
      attestation.requestDigest === digest &&
      attestation.title === issue.title &&
      hasValidSignature(attestation, attestationSecret)
    );
  });
}

module.exports = {
  compareEventIds,
  createApprovalAttestation,
  createAutoApprovalAttestation,
  createCiReadyAttestation,
  currentAcceptedEvent,
  currentCiReadyEvent,
  currentLabeledEvent,
  hasIssueStateChangeAfter,
  hasApprovalAttestation,
  hasAutoApprovalAttestation,
  hasCiReadyAttestation,
  parseApprovalAttestation,
  parseAutoApprovalAttestation,
  parseCiReadyAttestation,
  requestDigest,
};
