-- Baseline 3/6 — business tables (sales / purchase / production / shipping /
-- billing / inventory / intake / design).

-- app.billing_closings (TABLE)
CREATE TABLE app.billing_closings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_bp_id uuid NOT NULL,
    closing_date date NOT NULL,
    status app."CLOSING_STATUS" DEFAULT 'PENDING'::app."CLOSING_STATUS" NOT NULL,
    total_amount numeric(12,2),
    invoice_year_month character(6),
    invoice_seq integer,
    processed_at timestamp(6) with time zone,
    processed_by uuid,
    notes text,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- app.defect_records (TABLE)
CREATE TABLE app.defect_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    work_order_step_id uuid NOT NULL,
    defect_type_id integer NOT NULL,
    description text NOT NULL,
    recorded_by uuid,
    recorded_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- app.delivery_note_items (TABLE)
CREATE TABLE app.delivery_note_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    delivery_note_year_month character(6) NOT NULL,
    delivery_note_seq integer NOT NULL,
    product_id integer NOT NULL,
    quantity integer NOT NULL,
    unit_price numeric(12,2),
    amount numeric(12,2),
    notes text,
    sort_order integer DEFAULT 0 NOT NULL
);

-- app.delivery_notes (TABLE)
CREATE TABLE app.delivery_notes (
    year_month character(6) NOT NULL,
    seq integer NOT NULL,
    delivery_order_year_month character(6) NOT NULL,
    delivery_order_seq integer NOT NULL,
    delivery_method app."DELIVERY_METHOD" NOT NULL,
    recipient_bp_id uuid NOT NULL,
    recipient_branch_bp_id uuid,
    end_user_bp_id uuid,
    include_price boolean DEFAULT true NOT NULL,
    pdf_file_id uuid,
    status app."DELIVERY_STATUS" DEFAULT 'DRAFT'::app."DELIVERY_STATUS" NOT NULL,
    delivered_at timestamp(6) with time zone,
    notes text,
    created_by uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    sales_rep_id uuid
);

-- app.delivery_order_items (TABLE)
CREATE TABLE app.delivery_order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    delivery_order_year_month character(6) NOT NULL,
    delivery_order_seq integer NOT NULL,
    product_id integer NOT NULL,
    lot_number integer,
    quantity integer NOT NULL,
    notes text,
    sort_order integer DEFAULT 0 NOT NULL,
    order_line_id uuid
);

-- app.delivery_orders (TABLE)
CREATE TABLE app.delivery_orders (
    year_month character(6) NOT NULL,
    seq integer NOT NULL,
    work_order_id uuid,
    from_plant_id integer,
    type app."DELIVERY_ORDER_TYPE" NOT NULL,
    status app."DELIVERY_ORDER_STATUS" DEFAULT 'DRAFT'::app."DELIVERY_ORDER_STATUS" NOT NULL,
    shipped_at timestamp(6) with time zone,
    notes text,
    created_by uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    customer_bp_id uuid NOT NULL,
    customer_branch_bp_id uuid
);

-- app.design_files (TABLE)
CREATE TABLE app.design_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    design_request_id uuid,
    product_id integer,
    file_id uuid NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    is_latest boolean DEFAULT true NOT NULL,
    notes text,
    created_by uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- app.design_requests (TABLE)
CREATE TABLE app.design_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_number text NOT NULL,
    trigger app."DESIGN_TRIGGER" NOT NULL,
    quote_year_month character(6),
    quote_seq integer,
    order_line_id uuid,
    product_id integer,
    description text,
    status app."DESIGN_STATUS" DEFAULT 'PENDING'::app."DESIGN_STATUS" NOT NULL,
    completed_at timestamp(6) with time zone,
    created_by uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);

-- app.estimates (TABLE)
CREATE TABLE app.estimates (
    year_month character(6) NOT NULL,
    seq integer NOT NULL,
    name text NOT NULL,
    tool_type character varying(64) NOT NULL,
    status app."ESTIMATE_STATUS" DEFAULT 'DRAFT'::app."ESTIMATE_STATUS" NOT NULL,
    customer_bp_id uuid,
    reference_unit_price numeric(12,2),
    reference_date date,
    reference_overridden boolean DEFAULT false NOT NULL,
    input jsonb NOT NULL,
    result jsonb,
    registered_at timestamp(6) with time zone,
    notes text,
    created_by uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    material_type_id integer,
    diameter_code character(3),
    surface_finish_code character(1),
    product_id integer,
    sales_rep_id uuid
);

-- app.inspection_record_items (TABLE)
CREATE TABLE app.inspection_record_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    inspection_record_id uuid NOT NULL,
    template_item_id integer NOT NULL,
    measured_value text,
    is_pass boolean,
    notes text,
    measured_values jsonb,
    inspected_count integer,
    passed_count integer
);

-- app.inspection_records (TABLE)
CREATE TABLE app.inspection_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    work_order_step_id uuid NOT NULL,
    template_id integer NOT NULL,
    status app."INSPECTION_STATUS" DEFAULT 'PENDING'::app."INSPECTION_STATUS" NOT NULL,
    recorded_by uuid,
    approved_by uuid,
    recorded_at timestamp(6) with time zone,
    approved_at timestamp(6) with time zone,
    notes text
);

-- app.inventory_reservations (TABLE)
CREATE TABLE app.inventory_reservations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    inventory_type app."INVENTORY_TYPE" NOT NULL,
    inventory_id uuid NOT NULL,
    order_line_id uuid,
    work_order_id uuid,
    quantity numeric(12,3) NOT NULL,
    status app."RESERVATION_STATUS" DEFAULT 'RESERVED'::app."RESERVATION_STATUS" NOT NULL,
    reserved_at timestamp(6) with time zone,
    confirmed_at timestamp(6) with time zone,
    released_at timestamp(6) with time zone
);

-- app.inventory_transactions (TABLE)
CREATE TABLE app.inventory_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    inventory_type app."INVENTORY_TYPE" NOT NULL,
    inventory_id uuid NOT NULL,
    transaction_type app."TRANSACTION_TYPE" NOT NULL,
    quantity numeric(12,3) NOT NULL,
    reference_type text,
    reference_id text,
    notes text,
    created_by uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- app.invoice_items (TABLE)
CREATE TABLE app.invoice_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_year_month character(6) NOT NULL,
    invoice_seq integer NOT NULL,
    delivery_order_year_month character(6),
    delivery_order_seq integer,
    delivery_note_year_month character(6),
    delivery_note_seq integer,
    description jsonb NOT NULL,
    quantity integer NOT NULL,
    unit_price numeric(12,2) NOT NULL,
    amount numeric(12,2) NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    order_line_id uuid
);

-- app.invoices (TABLE)
CREATE TABLE app.invoices (
    year_month character(6) NOT NULL,
    seq integer NOT NULL,
    customer_bp_id uuid NOT NULL,
    customer_branch_bp_id uuid,
    billing_period_from date NOT NULL,
    billing_period_to date NOT NULL,
    subtotal numeric(12,2) NOT NULL,
    tax_amount numeric(12,2) NOT NULL,
    total_amount numeric(12,2) NOT NULL,
    status app."INVOICE_STATUS" DEFAULT 'DRAFT'::app."INVOICE_STATUS" NOT NULL,
    issued_at timestamp(6) with time zone,
    due_date date,
    sent_at timestamp(6) with time zone,
    pdf_file_id uuid,
    yayoi_exported_at timestamp(6) with time zone,
    notes text,
    created_by uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    sales_rep_id uuid,
    currency text DEFAULT 'JPY'::text NOT NULL
);

-- app.match_aliases (TABLE)
CREATE TABLE app.match_aliases (
    id integer NOT NULL,
    target_type text NOT NULL,
    target_id text NOT NULL,
    alias text NOT NULL,
    alias_key text NOT NULL,
    hit_count integer DEFAULT 0 NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT match_aliases_target_type_check CHECK ((target_type = ANY (ARRAY['business_partners'::text, 'products'::text])))
);

-- app.match_aliases_id_seq (SEQUENCE)
CREATE SEQUENCE app.match_aliases_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- app.match_aliases_id_seq (SEQUENCE OWNED BY)
ALTER SEQUENCE app.match_aliases_id_seq OWNED BY app.match_aliases.id;

-- app.material_inventory (TABLE)
CREATE TABLE app.material_inventory (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    material_id integer NOT NULL,
    plant_id integer,
    quantity numeric(12,3) DEFAULT 0 NOT NULL,
    reserved_quantity numeric(12,3) DEFAULT 0 NOT NULL,
    unit text NOT NULL,
    location text,
    notes text,
    updated_at timestamp(6) with time zone NOT NULL,
    storage_location_id integer,
    shelf_id integer,
    CONSTRAINT material_inventory_nonneg_check CHECK (((quantity >= (0)::numeric) AND (reserved_quantity >= (0)::numeric)))
);

-- app.material_purchase_order_items (TABLE)
CREATE TABLE app.material_purchase_order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    purchase_order_id uuid NOT NULL,
    quantity numeric(12,3) NOT NULL,
    unit text NOT NULL,
    unit_price numeric(12,2) NOT NULL,
    amount numeric(12,2) NOT NULL,
    currency text DEFAULT 'JPY'::text NOT NULL,
    expected_at date,
    notes text,
    sort_order integer DEFAULT 0 NOT NULL,
    material_id integer NOT NULL,
    plant_id integer,
    received_quantity numeric(12,3) DEFAULT 0 NOT NULL
);

-- app.material_purchase_orders (TABLE)
CREATE TABLE app.material_purchase_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    po_number text NOT NULL,
    supplier_bp_id uuid NOT NULL,
    status app."PURCHASE_STATUS" DEFAULT 'DRAFT'::app."PURCHASE_STATUS" NOT NULL,
    total_amount numeric(12,2) DEFAULT 0 NOT NULL,
    currency text DEFAULT 'JPY'::text NOT NULL,
    purchase_date date,
    requested_at timestamp(6) with time zone,
    requested_by uuid,
    approved_at timestamp(6) with time zone,
    approved_by uuid,
    ordered_at timestamp(6) with time zone,
    ordered_by uuid,
    completed_at timestamp(6) with time zone,
    completed_by uuid,
    cancelled_at timestamp(6) with time zone,
    cancelled_by uuid,
    cancel_reason text,
    history jsonb,
    notes text,
    created_by uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);

-- app.material_receipts (TABLE)
CREATE TABLE app.material_receipts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    supplier_bp_id uuid,
    purchase_order_item_id uuid,
    quantity numeric(12,3) NOT NULL,
    unit text NOT NULL,
    received_at date NOT NULL,
    notes text,
    created_by uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    material_id integer NOT NULL,
    plant_id integer
);

-- app.order_acceptance_cancel_requests (TABLE)
CREATE TABLE app.order_acceptance_cancel_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    acceptance_year_month character(6) NOT NULL,
    acceptance_seq integer NOT NULL,
    reason text NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    error text,
    requested_by uuid,
    requested_at timestamp(6) with time zone DEFAULT now() NOT NULL,
    resolved_by uuid,
    resolved_at timestamp(6) with time zone,
    CONSTRAINT order_acceptance_cancel_requests_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'APPLIED'::text, 'REJECTED'::text, 'CANCELLED'::text, 'FAILED'::text])))
);

-- app.order_acceptances (TABLE)
CREATE TABLE app.order_acceptances (
    year_month character(6) NOT NULL,
    seq integer NOT NULL,
    status app."ORDER_ACCEPTANCE_STATUS" DEFAULT 'IMPORT'::app."ORDER_ACCEPTANCE_STATUS" NOT NULL,
    source app."INTAKE_SOURCE" DEFAULT 'MANUAL'::app."INTAKE_SOURCE" NOT NULL,
    source_file_id uuid,
    extracted jsonb,
    extract_error text,
    customer_bp_id uuid,
    customer_branch_bp_id uuid,
    customer_order_ref text,
    order_date date,
    notes text,
    completed_at timestamp(6) with time zone,
    archived_at timestamp(6) with time zone,
    created_by uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    quote_seq integer,
    quote_year_month character(6),
    sales_rep_id uuid,
    ship_to_bp_id uuid,
    assigned_plant_id integer,
    shipping_work_location_id integer,
    currency text DEFAULT 'JPY'::text NOT NULL,
    delivery_method app."DELIVERY_METHOD" DEFAULT 'NORMAL'::app."DELIVERY_METHOD" NOT NULL,
    end_user_bp_id uuid
);

-- app.order_lines (TABLE)
CREATE TABLE app.order_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    acceptance_year_month character(6) NOT NULL,
    acceptance_seq integer NOT NULL,
    product_id integer,
    product_text text,
    order_type app."ORDER_TYPE" DEFAULT 'PRODUCTION'::app."ORDER_TYPE" NOT NULL,
    quantity integer NOT NULL,
    unit_price numeric(12,2),
    delivery_date date,
    notes text,
    sort_order integer DEFAULT 0 NOT NULL,
    branch integer,
    amount numeric(12,2),
    status app."ORDER_LINE_STATUS" DEFAULT 'DRAFT'::app."ORDER_LINE_STATUS" NOT NULL,
    lot_number integer,
    is_locked boolean DEFAULT false NOT NULL,
    end_user_bp_id uuid,
    confirmed_at timestamp(6) with time zone,
    cancelled_at timestamp(6) with time zone,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT order_lines_confirmed_complete CHECK (((status = 'DRAFT'::app."ORDER_LINE_STATUS") OR ((branch IS NOT NULL) AND (product_id IS NOT NULL) AND (unit_price IS NOT NULL) AND (amount IS NOT NULL) AND (confirmed_at IS NOT NULL))))
);

-- app.price_list_discounts (TABLE)
CREATE TABLE app.price_list_discounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    label text NOT NULL,
    discount_type app."PRICE_DISCOUNT_TYPE" NOT NULL,
    value numeric(12,2) NOT NULL,
    min_quantity integer DEFAULT 1 NOT NULL,
    max_quantity integer,
    valid_from date NOT NULL,
    valid_until date,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    variant_id uuid NOT NULL
);

-- app.price_list_entries (TABLE)
CREATE TABLE app.price_list_entries (
    customer_bp_id uuid NOT NULL,
    currency text DEFAULT 'JPY'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    product_id integer NOT NULL,
    year_month character(6) NOT NULL,
    seq integer NOT NULL,
    sales_rep_id uuid
);

-- app.price_list_tiers (TABLE)
CREATE TABLE app.price_list_tiers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    min_quantity integer DEFAULT 1 NOT NULL,
    max_quantity integer,
    multiplier numeric(8,3) DEFAULT 1 NOT NULL,
    price_override numeric(12,2),
    sort_order integer DEFAULT 0 NOT NULL,
    variant_id uuid NOT NULL
);

-- app.price_list_variants (TABLE)
CREATE TABLE app.price_list_variants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entry_year_month character(6) NOT NULL,
    entry_seq integer NOT NULL,
    order_type app."ORDER_TYPE" NOT NULL,
    base_unit_price numeric(12,2) DEFAULT 0 NOT NULL,
    valid_from date NOT NULL,
    valid_until date,
    estimate_year_month character(6),
    estimate_seq integer,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);

-- app.product_inventory (TABLE)
CREATE TABLE app.product_inventory (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id integer NOT NULL,
    plant_id integer,
    lot_number integer,
    quantity integer DEFAULT 0 NOT NULL,
    reserved_quantity integer DEFAULT 0 NOT NULL,
    is_semi_finished boolean DEFAULT false NOT NULL,
    source_step_id uuid,
    location text,
    notes text,
    updated_at timestamp(6) with time zone NOT NULL,
    storage_location_id integer,
    shelf_id integer,
    CONSTRAINT product_inventory_nonneg_check CHECK (((quantity >= 0) AND (reserved_quantity >= 0)))
);

-- app.purchase_request_items (TABLE)
CREATE TABLE app.purchase_request_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid NOT NULL,
    material_id integer NOT NULL,
    quantity numeric(12,3) NOT NULL,
    unit text NOT NULL,
    desired_at date,
    plant_id integer,
    notes text,
    sort_order integer DEFAULT 0 NOT NULL
);

-- app.purchase_requests (TABLE)
CREATE TABLE app.purchase_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_number text NOT NULL,
    status app."PURCHASE_REQUEST_STATUS" DEFAULT 'DRAFT'::app."PURCHASE_REQUEST_STATUS" NOT NULL,
    purpose text,
    requested_at timestamp(6) with time zone,
    requested_by uuid,
    approved_at timestamp(6) with time zone,
    approved_by uuid,
    ordered_at timestamp(6) with time zone,
    ordered_by uuid,
    cancelled_at timestamp(6) with time zone,
    cancelled_by uuid,
    cancel_reason text,
    history jsonb,
    purchase_order_id uuid,
    notes text,
    created_by uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);

-- app.quote_items (TABLE)
CREATE TABLE app.quote_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    quote_year_month character(6) NOT NULL,
    quote_seq integer NOT NULL,
    order_type app."ORDER_TYPE" NOT NULL,
    quantity integer NOT NULL,
    unit_price numeric(12,2) NOT NULL,
    price_list_tier_id uuid,
    discount_amount numeric(12,2) DEFAULT 0 NOT NULL,
    discount_label text,
    amount numeric(12,2) NOT NULL,
    delivery_date date,
    notes text,
    sort_order integer DEFAULT 0 NOT NULL,
    product_id integer NOT NULL
);

-- app.quotes (TABLE)
CREATE TABLE app.quotes (
    year_month character(6) NOT NULL,
    seq integer NOT NULL,
    customer_bp_id uuid NOT NULL,
    customer_branch_bp_id uuid,
    status app."QUOTE_STATUS" DEFAULT 'DRAFT'::app."QUOTE_STATUS" NOT NULL,
    valid_until date,
    notes text,
    pdf_file_id uuid,
    created_by uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    sales_rep_id uuid,
    currency text DEFAULT 'JPY'::text NOT NULL
);

-- app.storage_locations (TABLE)
CREATE TABLE app.storage_locations (
    id integer NOT NULL,
    plant_id integer NOT NULL,
    code text NOT NULL,
    name jsonb NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    notes text,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    floor_map_id uuid,
    map_x numeric(5,2),
    map_y numeric(5,2)
);

-- app.storage_locations_id_seq (SEQUENCE)
CREATE SEQUENCE app.storage_locations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- app.storage_locations_id_seq (SEQUENCE OWNED BY)
ALTER SEQUENCE app.storage_locations_id_seq OWNED BY app.storage_locations.id;

-- app.storage_shelves (TABLE)
CREATE TABLE app.storage_shelves (
    id integer NOT NULL,
    location_id integer NOT NULL,
    code text NOT NULL,
    name jsonb,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);

-- app.storage_shelves_id_seq (SEQUENCE)
CREATE SEQUENCE app.storage_shelves_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- app.storage_shelves_id_seq (SEQUENCE OWNED BY)
ALTER SEQUENCE app.storage_shelves_id_seq OWNED BY app.storage_shelves.id;

-- app.work_order_flow_changes (TABLE)
CREATE TABLE app.work_order_flow_changes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    work_order_id uuid NOT NULL,
    kind text NOT NULL,
    payload jsonb NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    error text,
    requested_by uuid,
    requested_at timestamp(6) with time zone DEFAULT now() NOT NULL,
    resolved_by uuid,
    resolved_at timestamp(6) with time zone,
    acknowledged_at timestamp(6) with time zone,
    acknowledged_by uuid,
    applied_at timestamp(6) with time zone,
    CONSTRAINT work_order_flow_changes_kind_check CHECK ((kind = ANY (ARRAY['ADD_BRANCH'::text, 'UPDATE_BRANCH'::text, 'REMOVE_BRANCH'::text]))),
    CONSTRAINT work_order_flow_changes_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'APPLIED'::text, 'REJECTED'::text, 'CANCELLED'::text, 'FAILED'::text])))
);

-- app.work_order_links (TABLE)
CREATE TABLE app.work_order_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_work_order_id uuid NOT NULL,
    target_work_order_id uuid NOT NULL,
    quantity integer,
    notes text,
    created_by uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT work_order_links_no_self CHECK ((source_work_order_id <> target_work_order_id))
);

-- app.work_order_order_lines (TABLE)
CREATE TABLE app.work_order_order_lines (
    work_order_id uuid NOT NULL,
    order_line_id uuid NOT NULL,
    quantity integer NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- app.work_order_step_actuals (TABLE)
CREATE TABLE app.work_order_step_actuals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    work_order_step_id uuid NOT NULL,
    user_id uuid NOT NULL,
    worked_date date NOT NULL,
    started_at timestamp(6) with time zone,
    ended_at timestamp(6) with time zone,
    quantity integer,
    notes text,
    created_by uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    work_location_id integer,
    concurrent_count integer DEFAULT 1 NOT NULL
);

-- app.work_order_step_inspection_templates (TABLE)
CREATE TABLE app.work_order_step_inspection_templates (
    work_order_step_id uuid NOT NULL,
    inspection_template_id integer NOT NULL
);

-- app.work_order_step_links (TABLE)
CREATE TABLE app.work_order_step_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    work_order_id uuid NOT NULL,
    source_step_id uuid NOT NULL,
    target_step_id uuid NOT NULL,
    routed_quantity integer DEFAULT 0 NOT NULL,
    notes text,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- app.work_order_step_plans (TABLE)
CREATE TABLE app.work_order_step_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    work_order_step_id uuid NOT NULL,
    user_id uuid NOT NULL,
    planned_date date NOT NULL,
    planned_start_at timestamp(6) with time zone,
    planned_end_at timestamp(6) with time zone,
    quantity integer,
    notes text,
    created_by uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    work_location_id integer
);

-- app.work_order_steps (TABLE)
CREATE TABLE app.work_order_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    work_order_id uuid NOT NULL,
    process_step_id integer NOT NULL,
    sort_order integer NOT NULL,
    execution_location app."STEP_EXECUTION" NOT NULL,
    plant_id integer,
    supplier_bp_id uuid,
    outsource_requested_at date,
    outsource_expected_at date,
    outsource_received_at date,
    status app."STEP_STATUS" DEFAULT 'PENDING'::app."STEP_STATUS" NOT NULL,
    input_quantity integer,
    output_success_quantity integer,
    output_defect_semi_finished integer,
    output_defect_scrap integer,
    output_defect_rework integer,
    session_locked_by uuid,
    session_locked_at timestamp(6) with time zone,
    started_at timestamp(6) with time zone,
    started_by uuid,
    completed_at timestamp(6) with time zone,
    completed_by uuid,
    cancelled_at timestamp(6) with time zone,
    cancelled_by uuid,
    cancel_reason text,
    notes text,
    outsource_cost numeric(12,2),
    defect_reasons jsonb,
    planned_work_hours numeric(6,2),
    branch_stock_disposition app."BRANCH_STOCK_DISPOSITION",
    lot_input_mode app."LOT_INPUT_MODE",
    lot_text text
);

-- app.work_orders (TABLE)
CREATE TABLE app.work_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    work_order_number integer NOT NULL,
    type app."WORK_ORDER_TYPE" NOT NULL,
    planned_quantity integer NOT NULL,
    material_id integer,
    status app."WORK_ORDER_STATUS" DEFAULT 'DRAFT'::app."WORK_ORDER_STATUS" NOT NULL,
    approval_status app."WORK_ORDER_APPROVAL_STATUS" DEFAULT 'NONE'::app."WORK_ORDER_APPROVAL_STATUS" NOT NULL,
    source_work_order_id uuid,
    requested_at timestamp(6) with time zone,
    requested_by uuid,
    rejected_at timestamp(6) with time zone,
    rejected_by uuid,
    reject_reason text,
    history jsonb,
    approved_at timestamp(6) with time zone,
    started_at timestamp(6) with time zone,
    completed_at timestamp(6) with time zone,
    notes text,
    created_by uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    route_version_id uuid,
    product_id integer NOT NULL,
    approved_by uuid,
    storage_location_id integer,
    year_month character(6) NOT NULL,
    seq integer NOT NULL
);

-- app.match_aliases id (DEFAULT)
ALTER TABLE ONLY app.match_aliases ALTER COLUMN id SET DEFAULT nextval('app.match_aliases_id_seq'::regclass);

-- app.storage_locations id (DEFAULT)
ALTER TABLE ONLY app.storage_locations ALTER COLUMN id SET DEFAULT nextval('app.storage_locations_id_seq'::regclass);

-- app.storage_shelves id (DEFAULT)
ALTER TABLE ONLY app.storage_shelves ALTER COLUMN id SET DEFAULT nextval('app.storage_shelves_id_seq'::regclass);
