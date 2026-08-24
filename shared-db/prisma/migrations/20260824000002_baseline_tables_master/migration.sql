-- Baseline 2/6 — master-data tables (master / bp / production-master / product-routes).
-- Constraints, indexes and foreign keys live in 5/6.

-- app.approval_delegates (TABLE)
CREATE TABLE app.approval_delegates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id integer NOT NULL,
    delegator_id uuid NOT NULL,
    delegate_id uuid NOT NULL,
    valid_from timestamp(6) with time zone NOT NULL,
    valid_until timestamp(6) with time zone NOT NULL,
    reason text,
    created_by uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- app.approval_flow_rule_steps (TABLE)
CREATE TABLE app.approval_flow_rule_steps (
    id integer NOT NULL,
    rule_id integer NOT NULL,
    step_no integer NOT NULL,
    name jsonb NOT NULL,
    group_id integer NOT NULL,
    mode app."APPROVAL_MODE" DEFAULT 'ANY'::app."APPROVAL_MODE" NOT NULL
);

-- app.approval_flow_rule_steps_id_seq (SEQUENCE)
CREATE SEQUENCE app.approval_flow_rule_steps_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- app.approval_flow_rule_steps_id_seq (SEQUENCE OWNED BY)
ALTER SEQUENCE app.approval_flow_rule_steps_id_seq OWNED BY app.approval_flow_rule_steps.id;

-- app.approval_flow_rules (TABLE)
CREATE TABLE app.approval_flow_rules (
    id integer NOT NULL,
    target_type text NOT NULL,
    name jsonb NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    conditions jsonb NOT NULL,
    updated_by uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- app.approval_flow_rules_id_seq (SEQUENCE)
CREATE SEQUENCE app.approval_flow_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- app.approval_flow_rules_id_seq (SEQUENCE OWNED BY)
ALTER SEQUENCE app.approval_flow_rules_id_seq OWNED BY app.approval_flow_rules.id;

-- app.approval_flow_steps (TABLE)
CREATE TABLE app.approval_flow_steps (
    id integer NOT NULL,
    target_type text NOT NULL,
    step_no integer NOT NULL,
    name jsonb NOT NULL,
    group_id integer NOT NULL,
    mode app."APPROVAL_MODE" DEFAULT 'ANY'::app."APPROVAL_MODE" NOT NULL,
    CONSTRAINT approval_flow_steps_step_no_check CHECK ((step_no >= 1))
);

-- app.approval_flow_steps_id_seq (SEQUENCE)
CREATE SEQUENCE app.approval_flow_steps_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- app.approval_flow_steps_id_seq (SEQUENCE OWNED BY)
ALTER SEQUENCE app.approval_flow_steps_id_seq OWNED BY app.approval_flow_steps.id;

-- app.approval_flows (TABLE)
CREATE TABLE app.approval_flows (
    target_type text NOT NULL,
    updated_by uuid,
    updated_at timestamp(6) with time zone DEFAULT now() NOT NULL,
    apply_mode text DEFAULT 'PRE'::text NOT NULL,
    CONSTRAINT approval_flows_apply_mode_check CHECK ((apply_mode = ANY (ARRAY['PRE'::text, 'POST'::text]))),
    CONSTRAINT approval_flows_target_type_check CHECK ((target_type = ANY (ARRAY['work_orders'::text, 'order_acceptances'::text, 'material_purchase_orders'::text, 'purchase_requests'::text, 'work_order_flow_changes'::text, 'order_acceptance_cancel_requests'::text])))
);

-- app.approval_group_members (TABLE)
CREATE TABLE app.approval_group_members (
    group_id integer NOT NULL,
    user_id uuid NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    valid_from timestamp(6) with time zone,
    valid_until timestamp(6) with time zone,
    note text,
    CONSTRAINT approval_group_members_validity_check CHECK ((((valid_from IS NULL) = (valid_until IS NULL)) AND ((valid_until IS NULL) OR (valid_until > valid_from))))
);

-- app.approval_groups (TABLE)
CREATE TABLE app.approval_groups (
    id integer NOT NULL,
    name jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);

-- app.approval_groups_id_seq (SEQUENCE)
CREATE SEQUENCE app.approval_groups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- app.approval_groups_id_seq (SEQUENCE OWNED BY)
ALTER SEQUENCE app.approval_groups_id_seq OWNED BY app.approval_groups.id;

-- app.approval_records (TABLE)
CREATE TABLE app.approval_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    approval_request_id uuid NOT NULL,
    approver_id uuid NOT NULL,
    delegate_for_id uuid,
    action app."APPROVAL_ACTION" NOT NULL,
    comment text,
    acted_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- app.approval_request_approvers (TABLE)
CREATE TABLE app.approval_request_approvers (
    approval_request_id uuid NOT NULL,
    user_id uuid NOT NULL,
    acted_at timestamp(6) with time zone,
    acted_by uuid
);

-- app.approval_requests (TABLE)
CREATE TABLE app.approval_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    target_type text NOT NULL,
    target_id text NOT NULL,
    status app."APPROVAL_REQUEST_STATUS" DEFAULT 'PENDING'::app."APPROVAL_REQUEST_STATUS" NOT NULL,
    requested_by uuid,
    requested_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    notes text,
    step_no integer NOT NULL,
    step_count integer NOT NULL,
    group_id integer,
    mode app."APPROVAL_MODE" DEFAULT 'ANY'::app."APPROVAL_MODE" NOT NULL,
    flow_snapshot jsonb NOT NULL
);

-- app.bp_contacts (TABLE)
CREATE TABLE app.bp_contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bp_id uuid NOT NULL,
    name text NOT NULL,
    name_kana text,
    department text,
    title text,
    email text,
    phone text,
    is_primary boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);

-- app.bp_customer_attrs (TABLE)
CREATE TABLE app.bp_customer_attrs (
    bp_id uuid NOT NULL,
    customer_code text,
    billing_bp_id uuid,
    closing_day smallint,
    payment_terms_days integer,
    payment_day smallint,
    credit_limit numeric(15,2),
    tax_type app."TAX_TYPE" DEFAULT 'TAXABLE'::app."TAX_TYPE" NOT NULL,
    invoice_method app."INVOICE_METHOD" DEFAULT 'EMAIL'::app."INVOICE_METHOD" NOT NULL,
    is_consignment boolean DEFAULT false NOT NULL,
    notes text
);

-- app.bp_end_user_attrs (TABLE)
CREATE TABLE app.bp_end_user_attrs (
    bp_id uuid NOT NULL,
    industry text,
    notes text
);

-- app.bp_role_assignments (TABLE)
CREATE TABLE app.bp_role_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bp_id uuid NOT NULL,
    role app."BP_ROLE" NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    assigned_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deactivated_at timestamp(6) with time zone
);

-- app.bp_sales_reps (TABLE)
CREATE TABLE app.bp_sales_reps (
    bp_id uuid NOT NULL,
    user_id uuid NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- app.bp_vendor_attrs (TABLE)
CREATE TABLE app.bp_vendor_attrs (
    bp_id uuid NOT NULL,
    vendor_code text,
    vendor_type app."VENDOR_TYPE" NOT NULL,
    closing_day smallint,
    payment_terms_days integer,
    payment_day smallint,
    bank_name text,
    bank_branch text,
    bank_account_type text,
    bank_account_number text,
    lead_time_days integer,
    notes text
);

-- app.business_partners (TABLE)
CREATE TABLE app.business_partners (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bp_code text,
    name jsonb NOT NULL,
    name_kana text,
    short_name text,
    parent_id uuid,
    country_code character varying(2),
    postal_code text,
    address jsonb,
    phone text,
    fax text,
    email text,
    website text,
    tax_number text,
    is_active boolean DEFAULT true NOT NULL,
    notes text,
    created_by uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    match_names text[] DEFAULT ARRAY[]::text[] NOT NULL,
    match_names_auto text[] DEFAULT '{}'::text[] NOT NULL
);

-- app.currencies (TABLE)
CREATE TABLE app.currencies (
    code text NOT NULL,
    name jsonb NOT NULL,
    rate_per_100_jpy numeric(18,6) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);

-- app.defect_types (TABLE)
CREATE TABLE app.defect_types (
    id integer NOT NULL,
    code text NOT NULL,
    name jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);

-- app.defect_types_id_seq (SEQUENCE)
CREATE SEQUENCE app.defect_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- app.defect_types_id_seq (SEQUENCE OWNED BY)
ALTER SEQUENCE app.defect_types_id_seq OWNED BY app.defect_types.id;

-- app.inspection_template_items (TABLE)
CREATE TABLE app.inspection_template_items (
    id integer NOT NULL,
    template_id integer NOT NULL,
    item_name jsonb NOT NULL,
    unit text,
    tolerance_min numeric(12,4),
    tolerance_max numeric(12,4),
    is_required boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    accept_bool boolean,
    accept_options jsonb,
    goal_value jsonb,
    input_type app."InspectionItemType" DEFAULT 'NUMBER'::app."InspectionItemType" NOT NULL,
    options jsonb,
    allow_manual_override boolean DEFAULT true NOT NULL
);

-- app.inspection_template_items_id_seq (SEQUENCE)
CREATE SEQUENCE app.inspection_template_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- app.inspection_template_items_id_seq (SEQUENCE OWNED BY)
ALTER SEQUENCE app.inspection_template_items_id_seq OWNED BY app.inspection_template_items.id;

-- app.inspection_templates (TABLE)
CREATE TABLE app.inspection_templates (
    id integer NOT NULL,
    code text NOT NULL,
    name jsonb NOT NULL,
    related_process_step_id integer,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    sampling_mode app."InspectionSamplingMode" DEFAULT 'ALL'::app."InspectionSamplingMode" NOT NULL,
    sampling_value numeric(10,2),
    record_style app."InspectionRecordStyle" DEFAULT 'VALUES'::app."InspectionRecordStyle" NOT NULL
);

-- app.inspection_templates_id_seq (SEQUENCE)
CREATE SEQUENCE app.inspection_templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- app.inspection_templates_id_seq (SEQUENCE OWNED BY)
ALTER SEQUENCE app.inspection_templates_id_seq OWNED BY app.inspection_templates.id;

-- app.material_diameters (TABLE)
CREATE TABLE app.material_diameters (
    code character(3) NOT NULL,
    diameter_mm numeric(8,3) NOT NULL,
    display_name jsonb,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);

-- app.material_kinds (TABLE)
CREATE TABLE app.material_kinds (
    shape_code character(1) NOT NULL,
    code character(2) NOT NULL,
    name jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);

-- app.material_length_variants (TABLE)
CREATE TABLE app.material_length_variants (
    code character(3) NOT NULL,
    length_mm numeric(10,3) NOT NULL,
    custom_label text,
    display_name jsonb,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);

-- app.material_manufacturer_grades (TABLE)
CREATE TABLE app.material_manufacturer_grades (
    manufacturer_code character(1) NOT NULL,
    code character(2) NOT NULL,
    name jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);

-- app.material_manufacturers (TABLE)
CREATE TABLE app.material_manufacturers (
    code character(1) NOT NULL,
    name jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);

-- app.material_shapes (TABLE)
CREATE TABLE app.material_shapes (
    code character(1) NOT NULL,
    name jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);

-- app.material_surface_finishes (TABLE)
CREATE TABLE app.material_surface_finishes (
    code character(1) NOT NULL,
    name jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);

-- app.material_type_prices (TABLE)
CREATE TABLE app.material_type_prices (
    id integer NOT NULL,
    material_type_id integer NOT NULL,
    diameter_code character(3) NOT NULL,
    surface_finish_code character(1) NOT NULL,
    unit_price numeric(12,2) NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);

-- app.material_type_prices_id_seq (SEQUENCE)
CREATE SEQUENCE app.material_type_prices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- app.material_type_prices_id_seq (SEQUENCE OWNED BY)
ALTER SEQUENCE app.material_type_prices_id_seq OWNED BY app.material_type_prices.id;

-- app.material_types (TABLE)
CREATE TABLE app.material_types (
    name jsonb NOT NULL,
    description jsonb,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    grade_code character(2),
    kind_code character(4),
    manufacturer_code character(1),
    shape_code character(1),
    id integer NOT NULL,
    code text,
    legacy_key text
);

-- app.material_types_id_new_seq (SEQUENCE)
CREATE SEQUENCE app.material_types_id_new_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- app.material_types_id_new_seq (SEQUENCE OWNED BY)
ALTER SEQUENCE app.material_types_id_new_seq OWNED BY app.material_types.id;

-- app.materials (TABLE)
CREATE TABLE app.materials (
    code text NOT NULL,
    name jsonb NOT NULL,
    unit text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    notes text,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    diameter_code character(3) NOT NULL,
    diameter_mm numeric(8,3) NOT NULL,
    kind_code character(2) NOT NULL,
    length_mm numeric(10,3) NOT NULL,
    length_variant_code character(3) NOT NULL,
    manufacturer_model text,
    nominal_diameter_mm numeric(8,3),
    surface_finish_code character(1) NOT NULL,
    material_type_id integer NOT NULL,
    id integer NOT NULL,
    match_names text[] DEFAULT '{}'::text[] NOT NULL
);

-- app.materials_id_new_seq (SEQUENCE)
CREATE SEQUENCE app.materials_id_new_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- app.materials_id_new_seq (SEQUENCE OWNED BY)
ALTER SEQUENCE app.materials_id_new_seq OWNED BY app.materials.id;

-- app.plants (TABLE)
CREATE TABLE app.plants (
    id integer NOT NULL,
    code text NOT NULL,
    name jsonb NOT NULL,
    name_kana text,
    country_code character varying(2),
    postal_code text,
    address jsonb,
    phone text,
    email text,
    contact_person text,
    is_active boolean DEFAULT true NOT NULL,
    notes text,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    region_id integer
);

-- app.plants_id_seq (SEQUENCE)
CREATE SEQUENCE app.plants_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- app.plants_id_seq (SEQUENCE OWNED BY)
ALTER SEQUENCE app.plants_id_seq OWNED BY app.plants.id;

-- app.process_step_catalog (TABLE)
CREATE TABLE app.process_step_catalog (
    id integer NOT NULL,
    code text NOT NULL,
    name jsonb NOT NULL,
    category app."PROCESS_CATEGORY" NOT NULL,
    execution_location app."PROCESS_EXECUTION" NOT NULL,
    is_sync_capable boolean DEFAULT false NOT NULL,
    is_inspection boolean DEFAULT false NOT NULL,
    is_approval_step boolean DEFAULT false NOT NULL,
    approval_min_rank text,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    notes text,
    quantity_tracking app."QUANTITY_TRACKING" DEFAULT 'FLOW'::app."QUANTITY_TRACKING" NOT NULL,
    default_work_hours numeric(6,2),
    lot_input_mode app."LOT_INPUT_MODE" DEFAULT 'NONE'::app."LOT_INPUT_MODE" NOT NULL
);

-- app.process_step_catalog_id_seq (SEQUENCE)
CREATE SEQUENCE app.process_step_catalog_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- app.process_step_catalog_id_seq (SEQUENCE OWNED BY)
ALTER SEQUENCE app.process_step_catalog_id_seq OWNED BY app.process_step_catalog.id;

-- app.process_step_exec_dependencies (TABLE)
CREATE TABLE app.process_step_exec_dependencies (
    step_id integer NOT NULL,
    depends_on_step_id integer NOT NULL,
    relation app."DEPENDENCY_RELATION" DEFAULT 'AND'::app."DEPENDENCY_RELATION" NOT NULL,
    notes text
);

-- app.process_step_use_dependencies (TABLE)
CREATE TABLE app.process_step_use_dependencies (
    step_id integer NOT NULL,
    depends_on_step_id integer NOT NULL,
    relation app."DEPENDENCY_RELATION" DEFAULT 'AND'::app."DEPENDENCY_RELATION" NOT NULL,
    is_negation boolean DEFAULT false NOT NULL,
    notes text
);

-- app.process_step_work_locations (TABLE)
CREATE TABLE app.process_step_work_locations (
    id integer NOT NULL,
    process_step_id integer NOT NULL,
    type_key text,
    work_location_id integer,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT process_step_work_locations_one_of_check CHECK (((type_key IS NULL) <> (work_location_id IS NULL)))
);

-- app.process_step_work_locations_id_seq (SEQUENCE)
CREATE SEQUENCE app.process_step_work_locations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- app.process_step_work_locations_id_seq (SEQUENCE OWNED BY)
ALTER SEQUENCE app.process_step_work_locations_id_seq OWNED BY app.process_step_work_locations.id;

-- app.product_process_route_version_steps (TABLE)
CREATE TABLE app.product_process_route_version_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    route_version_id uuid NOT NULL,
    process_step_id integer NOT NULL,
    sort_order integer NOT NULL,
    execution_location app."STEP_EXECUTION" NOT NULL,
    plant_id integer,
    supplier_bp_id uuid,
    work_hours numeric(6,2),
    lot_input_mode app."LOT_INPUT_MODE"
);

-- app.product_process_route_versions (TABLE)
CREATE TABLE app.product_process_route_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    route_id integer NOT NULL,
    version integer NOT NULL,
    notes text,
    created_by uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- app.product_process_routes (TABLE)
CREATE TABLE app.product_process_routes (
    id integer NOT NULL,
    product_id integer NOT NULL,
    name jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    notes text,
    created_by uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    customer_bp_id uuid
);

-- app.product_process_routes_id_seq (SEQUENCE)
CREATE SEQUENCE app.product_process_routes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- app.product_process_routes_id_seq (SEQUENCE OWNED BY)
ALTER SEQUENCE app.product_process_routes_id_seq OWNED BY app.product_process_routes.id;

-- app.products (TABLE)
CREATE TABLE app.products (
    name jsonb NOT NULL,
    unit text DEFAULT '本'::text NOT NULL,
    spec jsonb,
    is_active boolean DEFAULT true NOT NULL,
    notes text,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    id integer NOT NULL,
    year_month character(6),
    seq integer,
    legacy_key text,
    diameter_mm numeric(8,3),
    length_mm numeric(10,3),
    material_type_id integer,
    match_names text[] DEFAULT '{}'::text[] NOT NULL,
    currency text DEFAULT 'JPY'::text NOT NULL
);

-- app.products_id_new_seq (SEQUENCE)
CREATE SEQUENCE app.products_id_new_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- app.products_id_new_seq (SEQUENCE OWNED BY)
ALTER SEQUENCE app.products_id_new_seq OWNED BY app.products.id;

-- app.regions (TABLE)
CREATE TABLE app.regions (
    id integer NOT NULL,
    code text NOT NULL,
    name jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);

-- app.regions_id_seq (SEQUENCE)
CREATE SEQUENCE app.regions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- app.regions_id_seq (SEQUENCE OWNED BY)
ALTER SEQUENCE app.regions_id_seq OWNED BY app.regions.id;

-- app.work_location_groups (TABLE)
CREATE TABLE app.work_location_groups (
    id integer NOT NULL,
    code text NOT NULL,
    name jsonb NOT NULL,
    type_key text NOT NULL,
    plant_id integer,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    notes text,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);

-- app.work_location_groups_id_seq (SEQUENCE)
CREATE SEQUENCE app.work_location_groups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- app.work_location_groups_id_seq (SEQUENCE OWNED BY)
ALTER SEQUENCE app.work_location_groups_id_seq OWNED BY app.work_location_groups.id;

-- app.work_locations (TABLE)
CREATE TABLE app.work_locations (
    id integer NOT NULL,
    group_id integer NOT NULL,
    code text NOT NULL,
    name jsonb NOT NULL,
    capacity integer,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    notes text,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);

-- app.work_locations_id_seq (SEQUENCE)
CREATE SEQUENCE app.work_locations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- app.work_locations_id_seq (SEQUENCE OWNED BY)
ALTER SEQUENCE app.work_locations_id_seq OWNED BY app.work_locations.id;

-- app.approval_flow_rule_steps id (DEFAULT)
ALTER TABLE ONLY app.approval_flow_rule_steps ALTER COLUMN id SET DEFAULT nextval('app.approval_flow_rule_steps_id_seq'::regclass);

-- app.approval_flow_rules id (DEFAULT)
ALTER TABLE ONLY app.approval_flow_rules ALTER COLUMN id SET DEFAULT nextval('app.approval_flow_rules_id_seq'::regclass);

-- app.approval_flow_steps id (DEFAULT)
ALTER TABLE ONLY app.approval_flow_steps ALTER COLUMN id SET DEFAULT nextval('app.approval_flow_steps_id_seq'::regclass);

-- app.approval_groups id (DEFAULT)
ALTER TABLE ONLY app.approval_groups ALTER COLUMN id SET DEFAULT nextval('app.approval_groups_id_seq'::regclass);

-- app.defect_types id (DEFAULT)
ALTER TABLE ONLY app.defect_types ALTER COLUMN id SET DEFAULT nextval('app.defect_types_id_seq'::regclass);

-- app.inspection_template_items id (DEFAULT)
ALTER TABLE ONLY app.inspection_template_items ALTER COLUMN id SET DEFAULT nextval('app.inspection_template_items_id_seq'::regclass);

-- app.inspection_templates id (DEFAULT)
ALTER TABLE ONLY app.inspection_templates ALTER COLUMN id SET DEFAULT nextval('app.inspection_templates_id_seq'::regclass);

-- app.material_type_prices id (DEFAULT)
ALTER TABLE ONLY app.material_type_prices ALTER COLUMN id SET DEFAULT nextval('app.material_type_prices_id_seq'::regclass);

-- app.material_types id (DEFAULT)
ALTER TABLE ONLY app.material_types ALTER COLUMN id SET DEFAULT nextval('app.material_types_id_new_seq'::regclass);

-- app.materials id (DEFAULT)
ALTER TABLE ONLY app.materials ALTER COLUMN id SET DEFAULT nextval('app.materials_id_new_seq'::regclass);

-- app.plants id (DEFAULT)
ALTER TABLE ONLY app.plants ALTER COLUMN id SET DEFAULT nextval('app.plants_id_seq'::regclass);

-- app.process_step_catalog id (DEFAULT)
ALTER TABLE ONLY app.process_step_catalog ALTER COLUMN id SET DEFAULT nextval('app.process_step_catalog_id_seq'::regclass);

-- app.process_step_work_locations id (DEFAULT)
ALTER TABLE ONLY app.process_step_work_locations ALTER COLUMN id SET DEFAULT nextval('app.process_step_work_locations_id_seq'::regclass);

-- app.product_process_routes id (DEFAULT)
ALTER TABLE ONLY app.product_process_routes ALTER COLUMN id SET DEFAULT nextval('app.product_process_routes_id_seq'::regclass);

-- app.products id (DEFAULT)
ALTER TABLE ONLY app.products ALTER COLUMN id SET DEFAULT nextval('app.products_id_new_seq'::regclass);

-- app.regions id (DEFAULT)
ALTER TABLE ONLY app.regions ALTER COLUMN id SET DEFAULT nextval('app.regions_id_seq'::regclass);

-- app.work_location_groups id (DEFAULT)
ALTER TABLE ONLY app.work_location_groups ALTER COLUMN id SET DEFAULT nextval('app.work_location_groups_id_seq'::regclass);

-- app.work_locations id (DEFAULT)
ALTER TABLE ONLY app.work_locations ALTER COLUMN id SET DEFAULT nextval('app.work_locations_id_seq'::regclass);
