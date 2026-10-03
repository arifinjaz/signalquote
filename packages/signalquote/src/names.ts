import type { AttributeKind } from "./types.js";

const HOST_LABEL = /^(host|host\.name|host_name|hostname|instance|pod|pod_name|k8s\.pod\.name)$/i;

const UNBOUNDED_LABEL =
  /^(user[._-]?id|customer[._-]?id|account[._-]?id|email|e-mail|request[._-]?id|trace[._-]?id|span[._-]?id|session[._-]?id|device[._-]?id|uuid|ip|client[._-]?ip|order[._-]?id|cart[._-]?id|container[._-]?id)$/i;

const PII_NAME = /(email|e-mail|phone|ssn|address|first[._-]?name|last[._-]?name|full[._-]?name)/i;

const CORRELATION_NAME = /^(trace[._-]?id|span[._-]?id|request[._-]?id|correlation[._-]?id|traceparent)$/i;

const IDENTIFIER_NAME = UNBOUNDED_LABEL;

export function isHostLikeLabel(name: string): boolean {
  return HOST_LABEL.test(name);
}

export function inferLabelBounded(name: string): boolean {
  return !UNBOUNDED_LABEL.test(name);
}

export function inferAttributeKind(name: string): AttributeKind {
  if (PII_NAME.test(name)) return "pii";
  if (CORRELATION_NAME.test(name)) return "correlation";
  if (IDENTIFIER_NAME.test(name)) return "identifier";
  return "dimension";
}
