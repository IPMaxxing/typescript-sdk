type Open<Known extends string> = Known | (string & {});

type ObservedNetworkClass =
  | "mobile"
  | "hosting"
  | "residential"
  | "business"
  | "organization"
  | "government"
  | "military"
  | "education"
  | "library"
  | "dedicated"
  | "satellite"
  | "ixp"
  | "search_engine"
  | "ai_crawler";

type EvidenceSource =
  | "domestic_isp"
  | "usage_type"
  | "mobile_carrier"
  | "connection_type"
  | "network_tag"
  | "threat_intelligence"
  | "asn_tag"
  | "ixp";

export const ErrorCode = {
  InvalidRequest: 1000,
  InvalidPayload: 1001,
  InvalidIp: 1002,
  IpNotFound: 1003,
  RouteNotFound: 1004,
  InvalidApiKey: 1010,
  RateLimitExceeded: 1011,
  ServiceUnavailable: 1400,
  InternalError: 1401,
  InsufficientBalance: 1500,
  IdempotencyKeyConflict: 1501,
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode] | (number & {});

export type Product = Open<"geoip" | "intelligence">;

export type NetworkClass = Open<ObservedNetworkClass | "unknown">;

export type NetworkClassSource = Open<EvidenceSource | "none">;

export type LiveIntelligenceTag = Open<
  "hosting" | "public_dns_resolver" | "web_server" | "vpn" | "residential_proxy"
>;

export type RevokedNetworkTag = Open<"business_broadband" | "home_isp" | "mobile_isp">;

export type AnonymizerExemptionReason = Open<"cloudflare_cdn_origin" | "search_engine_crawler">;

export type CpePart = Open<"application" | "operating_system" | "hardware">;

export type RpkiStatus = Open<
  "valid" | "invalid_asn" | "invalid_length" | "unknown" | "not_routed"
>;

export type RpkiSource = Open<"RTR Live" | "Local Cache" | "Local DB">;

export type PtrConfidenceLevel = Open<"high" | "medium" | "low">;

export type PtrDatasetName = Open<"geonames" | "ourairports" | "operator-overrides" | "unlocode">;

export type PtrHintKind = Open<"iata" | "unlocode" | "clli" | "city_name" | "operator_code">;

export interface LookupRequest {
  ip: string;
}

export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  request_id: string;
  retryable: boolean;
}

export interface ErrorResponse {
  status: false;
  data: null;
  error: ApiErrorBody;
}

export interface Price {
  product: Product;
  name: string;
  unitMicros: number;
}

export interface Catalog {
  currency: "CNY";
  prices: Price[];
  purchaseEmail: string;
  available: boolean;
}

export interface CatalogResponse {
  status: true;
  data: Catalog;
}

export interface Wallet {
  product: Product;
  balanceMicros: number;
}

export interface LedgerEntry {
  id: string;
  product: Product;
  kind: Open<"credit" | "charge" | "adjustment">;
  amountMicros: number;
  balanceMicros: number;
  reference: string;
  createdAt: string;
}

export interface Account {
  id: string;
  name: string;
  keyPrefix: string;
  wallets: Wallet[];
  entries: LedgerEntry[];
}

export interface AccountResponse {
  status: true;
  data: Account;
}

export interface GeoIpAs {
  asn: string;
  name: string;
  name_en?: string;
  countryCode?: string;
  domain: string;
}

export interface Geolocation {
  city: string;
  region: string;
  district: string;
  region_code: string;
  adcode: string;
  country: string;
  country_code: string;
  continent: string;
  continent_code: string;
  latitude: number | null;
  longitude: number | null;
  timezone: string;
  postal_code: string;
  radius: number | null;
  area_code?: string;
  plus_code?: string;
  country_en?: string;
  country_zh?: string;
  region_en?: string;
  region_zh?: string;
  city_en?: string;
  city_zh?: string;
  district_en?: string;
  district_zh?: string;
}

export interface Currency {
  name: string;
  code: string;
  symbol: string;
  native: string;
  plural: string;
}

export interface TimeZone {
  name: string;
  abbr: string;
  offset: string;
  is_dst: boolean;
  current_time: string;
}

export interface GeoIpData {
  as: GeoIpAs;
  ip: string;
  geo: Geolocation;
  netmask: string;
  prefix_length: number | null;
  is_bogon: boolean;
  currency?: Currency | null;
  time_zone?: TimeZone | null;
  calling_code?: string | null;
}

export interface GeoIpResponse {
  status: true;
  data: GeoIpData;
}

export interface AsnEstimatedCapacity {
  lower_gbps: number;
  upper_gbps?: number;
  label: string;
}

export interface AsnExchangePort {
  capacity_gbps: number;
  operational?: boolean;
  rs_peer?: boolean;
}

export interface AsnExchange {
  name: string;
  countryCode?: string;
  type: Open<"physical" | "virtual">;
  ports: AsnExchangePort[];
}

export interface AsnConnectivity {
  declared_traffic: string;
  exchanges_total?: number;
  estimated_capacity: AsnEstimatedCapacity;
  exchanges: AsnExchange[];
}

export interface IntelligenceAs {
  asn: string;
  name: string;
  name_en?: string;
  countryCode?: string;
  domain: string;
  type: string;
  class?: string;
  tags?: string[];
  connectivity?: AsnConnectivity;
}

export interface PtrOperator {
  name: string;
  asn: string;
  suffix: string;
}

export interface PtrHint {
  value: string;
  kind: PtrHintKind;
}

export interface PtrMetroLocation {
  city: string;
  region: string | null;
  region_code: string | null;
  country: string;
  country_code: string;
  latitude: number;
  longitude: number;
  precision: "metro";
}

export interface PtrConfidence {
  level: PtrConfidenceLevel;
  score: number;
}

export interface PtrEvidenceSource {
  dataset: PtrDatasetName;
  version: string;
}

export interface PtrEvidence {
  rule_id: string;
  ruleset_version: string;
  sources: PtrEvidenceSource[];
}

export interface PtrLocatedIntelligence {
  hostname: string;
  status: "located";
  operator: PtrOperator;
  hint: PtrHint;
  location: PtrMetroLocation;
  confidence: PtrConfidence;
  evidence: PtrEvidence;
}

export interface PtrAsnMismatchIntelligence {
  hostname: string;
  status: "asn_mismatch";
  operator: PtrOperator;
  observed_asn: string;
  evidence: PtrEvidence;
}

export interface PtrUnmatchedIntelligence {
  hostname: string;
  status: "unmatched";
}

export type PtrIntelligence =
  | PtrLocatedIntelligence
  | PtrAsnMismatchIntelligence
  | PtrUnmatchedIntelligence;

export interface CpeObservation {
  cpe: string;
  part: CpePart;
  vendor: string;
  product: string;
  version: string | null;
}

export interface RpkiRtr {
  source: Open<"Cloudflare" | "MFEED" | "RTR">;
  server?: string;
  lastUpdated: number;
}

export interface RpkiValidator {
  source: "Local Cache";
  engine: "Local Cache";
  lastUpdated: number;
}

export interface RpkiInfo {
  status: RpkiStatus;
  source?: RpkiSource;
  route_source?: "Local DB";
  origin_asn?: string;
  route_prefix?: string;
  roa_prefix?: string;
  roa_asn?: string;
  max_length?: number;
  ta?: string;
  rtr?: RpkiRtr;
  validator?: RpkiValidator;
}

export interface AbuseCategoryCount {
  id: number;
  count: number;
}

export interface AbuseReports {
  confidence_score: number;
  total_reports: number;
  distinct_reporters: number;
  last_reported_at: string | null;
  is_whitelisted: boolean | null;
  categories: AbuseCategoryCount[];
}

export interface ResourceTransfer {
  transfer_time: string;
  transfer_type: string;
  source_resource: string;
  recipient_resource: string;
  source_registry: string;
  recipient_registry: string;
  source_holder: string;
  recipient_holder: string;
}

export interface SegmentProbe {
  ip: string;
  ports: number[];
  tags: LiveIntelligenceTag[];
}

export interface LiveIntelligence {
  ptr: PtrIntelligence[];
  nameservers: string[];
  cpes: CpeObservation[];
  tags: LiveIntelligenceTag[];
  revoked_tags: RevokedNetworkTag[];
  usage_type: string | null;
  rpki?: RpkiInfo;
  abuse?: AbuseReports | null;
  transfers?: ResourceTransfer[];
  segment_probe?: SegmentProbe | null;
}

export interface NetworkInfo {
  connection_type: string;
  usage_type: string;
  address_type?: string;
  net_speed: string;
  tags: string[];
}

export interface NetworkClassEvidence {
  class: Open<ObservedNetworkClass>;
  source: Open<EvidenceSource>;
  scope: Open<"ip" | "prefix" | "asn">;
  value: string;
}

export interface NetworkClassification {
  primary: NetworkClass;
  confidence: Open<"high" | "medium" | "low" | "unknown">;
  source: NetworkClassSource;
  conflicts: Open<ObservedNetworkClass>[];
  evidence: NetworkClassEvidence[];
}

export interface MobileCarrier {
  mcc: string;
  mnc: string;
  brand: string;
}

export interface Blocklist {
  name: string;
  site: string;
  type: string;
}

export interface ThreatScores {
  vpn_score: number | null;
  proxy_score: number | null;
  threat_score: number | null;
  trust_score: number | null;
}

export interface ThreatInfo {
  is_tor: boolean | null;
  is_vpn: boolean | null;
  is_icloud_relay: boolean | null;
  is_cloudflare_warp: boolean | null;
  is_proxy: boolean | null;
  is_datacenter: boolean | null;
  is_anonymous: boolean | null;
  is_known_attacker: boolean | null;
  is_known_abuser: boolean | null;
  is_threat: boolean | null;
  is_bogon: boolean;
  blocklists: Blocklist[];
  blocklist_count: number;
  scores: ThreatScores;
  anonymizer_exemptions?: AnonymizerExemptionReason[];
}

export interface Company {
  name: string | null;
  address: string | null;
  domain: string | null;
  phone: string | null;
  type: string | null;
  network: string | null;
  country: string | null;
  source?: string;
}

export interface AbuseContact {
  name: string | null;
  address: string | null;
  country: string | null;
  email: string | null;
  network: string | null;
  phone: string | null;
  source?: string;
}

export interface DnsPtrEvidence {
  hostname: string;
  sources: string[];
  forward_confirmed: boolean;
  first_seen: string | null;
  last_seen: string | null;
}

export interface DnsHostnameEvidence {
  hostname: string;
  kinds: Open<"fdns" | "ct">[];
  sources: string[];
  forward_confirmed: boolean;
  first_seen: string | null;
  last_seen: string | null;
}

export interface DnsRecords {
  ptr: string[];
  ptr_evidence: DnsPtrEvidence[];
  hostnames: DnsHostnameEvidence[];
  sources: string[];
  snapshot_id: string | null;
  updated_at: string | null;
}

export interface IntelligenceData {
  as: IntelligenceAs;
  intelligence: LiveIntelligence;
  ip: string;
  network?: NetworkInfo;
  network_class: NetworkClassification;
  mobile?: MobileCarrier;
  threat?: ThreatInfo;
  rpki?: RpkiInfo;
  company?: Company;
  abuse?: AbuseContact;
  dns?: DnsRecords;
  is_bogon: boolean;
  is_anycast: boolean | null;
  is_mobile: boolean | null;
  is_hosting: boolean | null;
  is_satellite: boolean | null;
}

export interface IntelligenceResponse {
  status: true;
  data: IntelligenceData;
}
