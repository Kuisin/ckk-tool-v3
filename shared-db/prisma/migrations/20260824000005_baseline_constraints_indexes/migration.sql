-- Baseline 5/6 — primary keys, unique/check constraints, indexes, foreign keys.
-- Foreign keys are last so cross-group references resolve regardless of table file.

-- app.approval_delegates approval_delegates_pkey (CONSTRAINT)
ALTER TABLE ONLY app.approval_delegates
    ADD CONSTRAINT approval_delegates_pkey PRIMARY KEY (id);

-- app.approval_flow_rule_steps approval_flow_rule_steps_pkey (CONSTRAINT)
ALTER TABLE ONLY app.approval_flow_rule_steps
    ADD CONSTRAINT approval_flow_rule_steps_pkey PRIMARY KEY (id);

-- app.approval_flow_rules approval_flow_rules_pkey (CONSTRAINT)
ALTER TABLE ONLY app.approval_flow_rules
    ADD CONSTRAINT approval_flow_rules_pkey PRIMARY KEY (id);

-- app.approval_flow_steps approval_flow_steps_pkey (CONSTRAINT)
ALTER TABLE ONLY app.approval_flow_steps
    ADD CONSTRAINT approval_flow_steps_pkey PRIMARY KEY (id);

-- app.approval_flows approval_flows_pkey (CONSTRAINT)
ALTER TABLE ONLY app.approval_flows
    ADD CONSTRAINT approval_flows_pkey PRIMARY KEY (target_type);

-- app.approval_group_members approval_group_members_pkey (CONSTRAINT)
ALTER TABLE ONLY app.approval_group_members
    ADD CONSTRAINT approval_group_members_pkey PRIMARY KEY (group_id, user_id);

-- app.approval_groups approval_groups_pkey (CONSTRAINT)
ALTER TABLE ONLY app.approval_groups
    ADD CONSTRAINT approval_groups_pkey PRIMARY KEY (id);

-- app.approval_records approval_records_pkey (CONSTRAINT)
ALTER TABLE ONLY app.approval_records
    ADD CONSTRAINT approval_records_pkey PRIMARY KEY (id);

-- app.approval_request_approvers approval_request_approvers_pkey (CONSTRAINT)
ALTER TABLE ONLY app.approval_request_approvers
    ADD CONSTRAINT approval_request_approvers_pkey PRIMARY KEY (approval_request_id, user_id);

-- app.approval_requests approval_requests_pkey (CONSTRAINT)
ALTER TABLE ONLY app.approval_requests
    ADD CONSTRAINT approval_requests_pkey PRIMARY KEY (id);

-- app.audit_logs audit_logs_pkey (CONSTRAINT)
ALTER TABLE ONLY app.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);

-- app.billing_closings billing_closings_pkey (CONSTRAINT)
ALTER TABLE ONLY app.billing_closings
    ADD CONSTRAINT billing_closings_pkey PRIMARY KEY (id);

-- app.bp_contacts bp_contacts_pkey (CONSTRAINT)
ALTER TABLE ONLY app.bp_contacts
    ADD CONSTRAINT bp_contacts_pkey PRIMARY KEY (id);

-- app.bp_customer_attrs bp_customer_attrs_pkey (CONSTRAINT)
ALTER TABLE ONLY app.bp_customer_attrs
    ADD CONSTRAINT bp_customer_attrs_pkey PRIMARY KEY (bp_id);

-- app.bp_end_user_attrs bp_end_user_attrs_pkey (CONSTRAINT)
ALTER TABLE ONLY app.bp_end_user_attrs
    ADD CONSTRAINT bp_end_user_attrs_pkey PRIMARY KEY (bp_id);

-- app.bp_role_assignments bp_role_assignments_pkey (CONSTRAINT)
ALTER TABLE ONLY app.bp_role_assignments
    ADD CONSTRAINT bp_role_assignments_pkey PRIMARY KEY (id);

-- app.bp_sales_reps bp_sales_reps_pkey (CONSTRAINT)
ALTER TABLE ONLY app.bp_sales_reps
    ADD CONSTRAINT bp_sales_reps_pkey PRIMARY KEY (bp_id, user_id);

-- app.bp_vendor_attrs bp_vendor_attrs_pkey (CONSTRAINT)
ALTER TABLE ONLY app.bp_vendor_attrs
    ADD CONSTRAINT bp_vendor_attrs_pkey PRIMARY KEY (bp_id);

-- app.business_partners business_partners_pkey (CONSTRAINT)
ALTER TABLE ONLY app.business_partners
    ADD CONSTRAINT business_partners_pkey PRIMARY KEY (id);

-- app.currencies currencies_pkey (CONSTRAINT)
ALTER TABLE ONLY app.currencies
    ADD CONSTRAINT currencies_pkey PRIMARY KEY (code);

-- app.defect_records defect_records_pkey (CONSTRAINT)
ALTER TABLE ONLY app.defect_records
    ADD CONSTRAINT defect_records_pkey PRIMARY KEY (id);

-- app.defect_types defect_types_pkey (CONSTRAINT)
ALTER TABLE ONLY app.defect_types
    ADD CONSTRAINT defect_types_pkey PRIMARY KEY (id);

-- app.delivery_note_items delivery_note_items_pkey (CONSTRAINT)
ALTER TABLE ONLY app.delivery_note_items
    ADD CONSTRAINT delivery_note_items_pkey PRIMARY KEY (id);

-- app.delivery_notes delivery_notes_pkey (CONSTRAINT)
ALTER TABLE ONLY app.delivery_notes
    ADD CONSTRAINT delivery_notes_pkey PRIMARY KEY (year_month, seq);

-- app.delivery_order_items delivery_order_items_pkey (CONSTRAINT)
ALTER TABLE ONLY app.delivery_order_items
    ADD CONSTRAINT delivery_order_items_pkey PRIMARY KEY (id);

-- app.delivery_orders delivery_orders_pkey (CONSTRAINT)
ALTER TABLE ONLY app.delivery_orders
    ADD CONSTRAINT delivery_orders_pkey PRIMARY KEY (year_month, seq);

-- app.design_files design_files_pkey (CONSTRAINT)
ALTER TABLE ONLY app.design_files
    ADD CONSTRAINT design_files_pkey PRIMARY KEY (id);

-- app.design_requests design_requests_pkey (CONSTRAINT)
ALTER TABLE ONLY app.design_requests
    ADD CONSTRAINT design_requests_pkey PRIMARY KEY (id);

-- app.document_attachments document_attachments_pkey (CONSTRAINT)
ALTER TABLE ONLY app.document_attachments
    ADD CONSTRAINT document_attachments_pkey PRIMARY KEY (id);

-- app.document_memo_revisions document_memo_revisions_pkey (CONSTRAINT)
ALTER TABLE ONLY app.document_memo_revisions
    ADD CONSTRAINT document_memo_revisions_pkey PRIMARY KEY (id);

-- app.document_memos document_memos_pkey (CONSTRAINT)
ALTER TABLE ONLY app.document_memos
    ADD CONSTRAINT document_memos_pkey PRIMARY KEY (id);

-- app.estimates estimates_pkey (CONSTRAINT)
ALTER TABLE ONLY app.estimates
    ADD CONSTRAINT estimates_pkey PRIMARY KEY (year_month, seq);

-- app.feature_flags feature_flags_pkey (CONSTRAINT)
ALTER TABLE ONLY app.feature_flags
    ADD CONSTRAINT feature_flags_pkey PRIMARY KEY (key);

-- app.file_folder_grants file_folder_grants_pkey (CONSTRAINT)
ALTER TABLE ONLY app.file_folder_grants
    ADD CONSTRAINT file_folder_grants_pkey PRIMARY KEY (id);

-- app.files files_pkey (CONSTRAINT)
ALTER TABLE ONLY app.files
    ADD CONSTRAINT files_pkey PRIMARY KEY (id);

-- app.inspection_record_items inspection_record_items_pkey (CONSTRAINT)
ALTER TABLE ONLY app.inspection_record_items
    ADD CONSTRAINT inspection_record_items_pkey PRIMARY KEY (id);

-- app.inspection_records inspection_records_pkey (CONSTRAINT)
ALTER TABLE ONLY app.inspection_records
    ADD CONSTRAINT inspection_records_pkey PRIMARY KEY (id);

-- app.inspection_template_items inspection_template_items_pkey (CONSTRAINT)
ALTER TABLE ONLY app.inspection_template_items
    ADD CONSTRAINT inspection_template_items_pkey PRIMARY KEY (id);

-- app.inspection_templates inspection_templates_pkey (CONSTRAINT)
ALTER TABLE ONLY app.inspection_templates
    ADD CONSTRAINT inspection_templates_pkey PRIMARY KEY (id);

-- app.inventory_reservations inventory_reservations_pkey (CONSTRAINT)
ALTER TABLE ONLY app.inventory_reservations
    ADD CONSTRAINT inventory_reservations_pkey PRIMARY KEY (id);

-- app.inventory_transactions inventory_transactions_pkey (CONSTRAINT)
ALTER TABLE ONLY app.inventory_transactions
    ADD CONSTRAINT inventory_transactions_pkey PRIMARY KEY (id);

-- app.invoice_items invoice_items_pkey (CONSTRAINT)
ALTER TABLE ONLY app.invoice_items
    ADD CONSTRAINT invoice_items_pkey PRIMARY KEY (id);

-- app.invoices invoices_pkey (CONSTRAINT)
ALTER TABLE ONLY app.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (year_month, seq);

-- app.kiosk_cards kiosk_cards_pkey (CONSTRAINT)
ALTER TABLE ONLY app.kiosk_cards
    ADD CONSTRAINT kiosk_cards_pkey PRIMARY KEY (id);

-- app.kiosk_device_locations kiosk_device_locations_pkey (CONSTRAINT)
ALTER TABLE ONLY app.kiosk_device_locations
    ADD CONSTRAINT kiosk_device_locations_pkey PRIMARY KEY (id);

-- app.kiosk_device_logs kiosk_device_logs_pkey (CONSTRAINT)
ALTER TABLE ONLY app.kiosk_device_logs
    ADD CONSTRAINT kiosk_device_logs_pkey PRIMARY KEY (id);

-- app.kiosk_devices kiosk_devices_pkey (CONSTRAINT)
ALTER TABLE ONLY app.kiosk_devices
    ADD CONSTRAINT kiosk_devices_pkey PRIMARY KEY (id);

-- app.kiosk_floor_maps kiosk_floor_maps_pkey (CONSTRAINT)
ALTER TABLE ONLY app.kiosk_floor_maps
    ADD CONSTRAINT kiosk_floor_maps_pkey PRIMARY KEY (id);

-- app.kiosk_link_requests kiosk_link_requests_pkey (CONSTRAINT)
ALTER TABLE ONLY app.kiosk_link_requests
    ADD CONSTRAINT kiosk_link_requests_pkey PRIMARY KEY (id);

-- app.kiosk_sessions kiosk_sessions_pkey (CONSTRAINT)
ALTER TABLE ONLY app.kiosk_sessions
    ADD CONSTRAINT kiosk_sessions_pkey PRIMARY KEY (id);

-- app.link_blacklist link_blacklist_pkey (CONSTRAINT)
ALTER TABLE ONLY app.link_blacklist
    ADD CONSTRAINT link_blacklist_pkey PRIMARY KEY (id);

-- app.link_index link_index_pkey (CONSTRAINT)
ALTER TABLE ONLY app.link_index
    ADD CONSTRAINT link_index_pkey PRIMARY KEY (id);

-- app.match_aliases match_aliases_pkey (CONSTRAINT)
ALTER TABLE ONLY app.match_aliases
    ADD CONSTRAINT match_aliases_pkey PRIMARY KEY (id);

-- app.material_diameters material_diameters_pkey (CONSTRAINT)
ALTER TABLE ONLY app.material_diameters
    ADD CONSTRAINT material_diameters_pkey PRIMARY KEY (code);

-- app.material_inventory material_inventory_pkey (CONSTRAINT)
ALTER TABLE ONLY app.material_inventory
    ADD CONSTRAINT material_inventory_pkey PRIMARY KEY (id);

-- app.material_kinds material_kinds_pkey (CONSTRAINT)
ALTER TABLE ONLY app.material_kinds
    ADD CONSTRAINT material_kinds_pkey PRIMARY KEY (shape_code, code);

-- app.material_length_variants material_length_variants_pkey (CONSTRAINT)
ALTER TABLE ONLY app.material_length_variants
    ADD CONSTRAINT material_length_variants_pkey PRIMARY KEY (code);

-- app.material_manufacturer_grades material_manufacturer_grades_pkey (CONSTRAINT)
ALTER TABLE ONLY app.material_manufacturer_grades
    ADD CONSTRAINT material_manufacturer_grades_pkey PRIMARY KEY (manufacturer_code, code);

-- app.material_manufacturers material_manufacturers_pkey (CONSTRAINT)
ALTER TABLE ONLY app.material_manufacturers
    ADD CONSTRAINT material_manufacturers_pkey PRIMARY KEY (code);

-- app.material_purchase_order_items material_purchase_order_items_pkey (CONSTRAINT)
ALTER TABLE ONLY app.material_purchase_order_items
    ADD CONSTRAINT material_purchase_order_items_pkey PRIMARY KEY (id);

-- app.material_purchase_orders material_purchase_orders_pkey (CONSTRAINT)
ALTER TABLE ONLY app.material_purchase_orders
    ADD CONSTRAINT material_purchase_orders_pkey PRIMARY KEY (id);

-- app.material_receipts material_receipts_pkey (CONSTRAINT)
ALTER TABLE ONLY app.material_receipts
    ADD CONSTRAINT material_receipts_pkey PRIMARY KEY (id);

-- app.material_shapes material_shapes_pkey (CONSTRAINT)
ALTER TABLE ONLY app.material_shapes
    ADD CONSTRAINT material_shapes_pkey PRIMARY KEY (code);

-- app.material_surface_finishes material_surface_finishes_pkey (CONSTRAINT)
ALTER TABLE ONLY app.material_surface_finishes
    ADD CONSTRAINT material_surface_finishes_pkey PRIMARY KEY (code);

-- app.material_type_prices material_type_prices_pkey (CONSTRAINT)
ALTER TABLE ONLY app.material_type_prices
    ADD CONSTRAINT material_type_prices_pkey PRIMARY KEY (id);

-- app.material_types material_types_pkey (CONSTRAINT)
ALTER TABLE ONLY app.material_types
    ADD CONSTRAINT material_types_pkey PRIMARY KEY (id);

-- app.materials materials_pkey (CONSTRAINT)
ALTER TABLE ONLY app.materials
    ADD CONSTRAINT materials_pkey PRIMARY KEY (id);

-- app.notifications notifications_pkey (CONSTRAINT)
ALTER TABLE ONLY app.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);

-- app.numbering_sequences numbering_sequences_pkey (CONSTRAINT)
ALTER TABLE ONLY app.numbering_sequences
    ADD CONSTRAINT numbering_sequences_pkey PRIMARY KEY (key);

-- app.order_acceptance_cancel_requests order_acceptance_cancel_requests_pkey (CONSTRAINT)
ALTER TABLE ONLY app.order_acceptance_cancel_requests
    ADD CONSTRAINT order_acceptance_cancel_requests_pkey PRIMARY KEY (id);

-- app.order_acceptances order_acceptances_pkey (CONSTRAINT)
ALTER TABLE ONLY app.order_acceptances
    ADD CONSTRAINT order_acceptances_pkey PRIMARY KEY (year_month, seq);

-- app.order_lines order_lines_pkey (CONSTRAINT)
ALTER TABLE ONLY app.order_lines
    ADD CONSTRAINT order_lines_pkey PRIMARY KEY (id);

-- app.permissions permissions_pkey (CONSTRAINT)
ALTER TABLE ONLY app.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (code);

-- app.plants plants_pkey (CONSTRAINT)
ALTER TABLE ONLY app.plants
    ADD CONSTRAINT plants_pkey PRIMARY KEY (id);

-- app.price_list_discounts price_list_discounts_pkey (CONSTRAINT)
ALTER TABLE ONLY app.price_list_discounts
    ADD CONSTRAINT price_list_discounts_pkey PRIMARY KEY (id);

-- app.price_list_entries price_list_entries_pkey (CONSTRAINT)
ALTER TABLE ONLY app.price_list_entries
    ADD CONSTRAINT price_list_entries_pkey PRIMARY KEY (year_month, seq);

-- app.price_list_tiers price_list_tiers_pkey (CONSTRAINT)
ALTER TABLE ONLY app.price_list_tiers
    ADD CONSTRAINT price_list_tiers_pkey PRIMARY KEY (id);

-- app.price_list_variants price_list_variants_pkey (CONSTRAINT)
ALTER TABLE ONLY app.price_list_variants
    ADD CONSTRAINT price_list_variants_pkey PRIMARY KEY (id);

-- app.process_step_catalog process_step_catalog_pkey (CONSTRAINT)
ALTER TABLE ONLY app.process_step_catalog
    ADD CONSTRAINT process_step_catalog_pkey PRIMARY KEY (id);

-- app.process_step_exec_dependencies process_step_exec_dependencies_pkey (CONSTRAINT)
ALTER TABLE ONLY app.process_step_exec_dependencies
    ADD CONSTRAINT process_step_exec_dependencies_pkey PRIMARY KEY (step_id, depends_on_step_id);

-- app.process_step_use_dependencies process_step_use_dependencies_pkey (CONSTRAINT)
ALTER TABLE ONLY app.process_step_use_dependencies
    ADD CONSTRAINT process_step_use_dependencies_pkey PRIMARY KEY (step_id, depends_on_step_id);

-- app.process_step_work_locations process_step_work_locations_pkey (CONSTRAINT)
ALTER TABLE ONLY app.process_step_work_locations
    ADD CONSTRAINT process_step_work_locations_pkey PRIMARY KEY (id);

-- app.product_inventory product_inventory_pkey (CONSTRAINT)
ALTER TABLE ONLY app.product_inventory
    ADD CONSTRAINT product_inventory_pkey PRIMARY KEY (id);

-- app.product_process_route_version_steps product_process_route_version_steps_pkey (CONSTRAINT)
ALTER TABLE ONLY app.product_process_route_version_steps
    ADD CONSTRAINT product_process_route_version_steps_pkey PRIMARY KEY (id);

-- app.product_process_route_versions product_process_route_versions_pkey (CONSTRAINT)
ALTER TABLE ONLY app.product_process_route_versions
    ADD CONSTRAINT product_process_route_versions_pkey PRIMARY KEY (id);

-- app.product_process_routes product_process_routes_pkey (CONSTRAINT)
ALTER TABLE ONLY app.product_process_routes
    ADD CONSTRAINT product_process_routes_pkey PRIMARY KEY (id);

-- app.products products_pkey (CONSTRAINT)
ALTER TABLE ONLY app.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);

-- app.purchase_request_items purchase_request_items_pkey (CONSTRAINT)
ALTER TABLE ONLY app.purchase_request_items
    ADD CONSTRAINT purchase_request_items_pkey PRIMARY KEY (id);

-- app.purchase_requests purchase_requests_pkey (CONSTRAINT)
ALTER TABLE ONLY app.purchase_requests
    ADD CONSTRAINT purchase_requests_pkey PRIMARY KEY (id);

-- app.push_subscriptions push_subscriptions_pkey (CONSTRAINT)
ALTER TABLE ONLY app.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);

-- app.quote_items quote_items_pkey (CONSTRAINT)
ALTER TABLE ONLY app.quote_items
    ADD CONSTRAINT quote_items_pkey PRIMARY KEY (id);

-- app.quotes quotes_pkey (CONSTRAINT)
ALTER TABLE ONLY app.quotes
    ADD CONSTRAINT quotes_pkey PRIMARY KEY (year_month, seq);

-- app.regions regions_pkey (CONSTRAINT)
ALTER TABLE ONLY app.regions
    ADD CONSTRAINT regions_pkey PRIMARY KEY (id);

-- app.role_permission_relation role_permission_relation_pkey (CONSTRAINT)
ALTER TABLE ONLY app.role_permission_relation
    ADD CONSTRAINT role_permission_relation_pkey PRIMARY KEY (role_id, action, permission_code);

-- app.roles roles_pkey (CONSTRAINT)
ALTER TABLE ONLY app.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);

-- app.storage_locations storage_locations_pkey (CONSTRAINT)
ALTER TABLE ONLY app.storage_locations
    ADD CONSTRAINT storage_locations_pkey PRIMARY KEY (id);

-- app.storage_shelves storage_shelves_pkey (CONSTRAINT)
ALTER TABLE ONLY app.storage_shelves
    ADD CONSTRAINT storage_shelves_pkey PRIMARY KEY (id);

-- app.system_settings system_settings_pkey (CONSTRAINT)
ALTER TABLE ONLY app.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (key);

-- app.user_home_settings user_home_settings_pkey (CONSTRAINT)
ALTER TABLE ONLY app.user_home_settings
    ADD CONSTRAINT user_home_settings_pkey PRIMARY KEY (user_id);

-- app.user_notification_settings user_notification_settings_pkey (CONSTRAINT)
ALTER TABLE ONLY app.user_notification_settings
    ADD CONSTRAINT user_notification_settings_pkey PRIMARY KEY (user_id);

-- app.user_plants user_plants_pkey (CONSTRAINT)
ALTER TABLE ONLY app.user_plants
    ADD CONSTRAINT user_plants_pkey PRIMARY KEY (user_id, plant_id);

-- app.user_role_relation user_role_relation_pkey (CONSTRAINT)
ALTER TABLE ONLY app.user_role_relation
    ADD CONSTRAINT user_role_relation_pkey PRIMARY KEY (user_id, role_id);

-- app.users users_pkey (CONSTRAINT)
ALTER TABLE ONLY app.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

-- app.work_location_groups work_location_groups_pkey (CONSTRAINT)
ALTER TABLE ONLY app.work_location_groups
    ADD CONSTRAINT work_location_groups_pkey PRIMARY KEY (id);

-- app.work_locations work_locations_pkey (CONSTRAINT)
ALTER TABLE ONLY app.work_locations
    ADD CONSTRAINT work_locations_pkey PRIMARY KEY (id);

-- app.work_order_flow_changes work_order_flow_changes_pkey (CONSTRAINT)
ALTER TABLE ONLY app.work_order_flow_changes
    ADD CONSTRAINT work_order_flow_changes_pkey PRIMARY KEY (id);

-- app.work_order_links work_order_links_pkey (CONSTRAINT)
ALTER TABLE ONLY app.work_order_links
    ADD CONSTRAINT work_order_links_pkey PRIMARY KEY (id);

-- app.work_order_order_lines work_order_order_lines_pkey (CONSTRAINT)
ALTER TABLE ONLY app.work_order_order_lines
    ADD CONSTRAINT work_order_order_lines_pkey PRIMARY KEY (work_order_id, order_line_id);

-- app.work_order_step_actuals work_order_step_actuals_pkey (CONSTRAINT)
ALTER TABLE ONLY app.work_order_step_actuals
    ADD CONSTRAINT work_order_step_actuals_pkey PRIMARY KEY (id);

-- app.work_order_step_inspection_templates work_order_step_inspection_templates_pkey (CONSTRAINT)
ALTER TABLE ONLY app.work_order_step_inspection_templates
    ADD CONSTRAINT work_order_step_inspection_templates_pkey PRIMARY KEY (work_order_step_id, inspection_template_id);

-- app.work_order_step_links work_order_step_links_pkey (CONSTRAINT)
ALTER TABLE ONLY app.work_order_step_links
    ADD CONSTRAINT work_order_step_links_pkey PRIMARY KEY (id);

-- app.work_order_step_plans work_order_step_plans_pkey (CONSTRAINT)
ALTER TABLE ONLY app.work_order_step_plans
    ADD CONSTRAINT work_order_step_plans_pkey PRIMARY KEY (id);

-- app.work_order_steps work_order_steps_pkey (CONSTRAINT)
ALTER TABLE ONLY app.work_order_steps
    ADD CONSTRAINT work_order_steps_pkey PRIMARY KEY (id);

-- app.work_orders work_orders_pkey (CONSTRAINT)
ALTER TABLE ONLY app.work_orders
    ADD CONSTRAINT work_orders_pkey PRIMARY KEY (id);

-- directory.employee_directory employee_directory_pkey (CONSTRAINT)
ALTER TABLE ONLY directory.employee_directory
    ADD CONSTRAINT employee_directory_pkey PRIMARY KEY (username);

-- directory.ldap_sync_log ldap_sync_log_pkey (CONSTRAINT)
ALTER TABLE ONLY directory.ldap_sync_log
    ADD CONSTRAINT ldap_sync_log_pkey PRIMARY KEY (id);

-- app.approval_delegates_delegate_id_idx (INDEX)
CREATE INDEX approval_delegates_delegate_id_idx ON app.approval_delegates USING btree (delegate_id);

-- app.approval_delegates_group_id_valid_from_valid_until_idx (INDEX)
CREATE INDEX approval_delegates_group_id_valid_from_valid_until_idx ON app.approval_delegates USING btree (group_id, valid_from, valid_until);

-- app.approval_flow_rule_steps_group_id_idx (INDEX)
CREATE INDEX approval_flow_rule_steps_group_id_idx ON app.approval_flow_rule_steps USING btree (group_id);

-- app.approval_flow_rule_steps_rule_id_step_no_key (INDEX)
CREATE UNIQUE INDEX approval_flow_rule_steps_rule_id_step_no_key ON app.approval_flow_rule_steps USING btree (rule_id, step_no);

-- app.approval_flow_rules_target_type_priority_idx (INDEX)
CREATE INDEX approval_flow_rules_target_type_priority_idx ON app.approval_flow_rules USING btree (target_type, priority);

-- app.approval_flow_steps_group_id_idx (INDEX)
CREATE INDEX approval_flow_steps_group_id_idx ON app.approval_flow_steps USING btree (group_id);

-- app.approval_flow_steps_target_type_step_no_key (INDEX)
CREATE UNIQUE INDEX approval_flow_steps_target_type_step_no_key ON app.approval_flow_steps USING btree (target_type, step_no);

-- app.approval_records_approval_request_id_idx (INDEX)
CREATE INDEX approval_records_approval_request_id_idx ON app.approval_records USING btree (approval_request_id);

-- app.approval_requests_pending_unique (INDEX)
CREATE UNIQUE INDEX approval_requests_pending_unique ON app.approval_requests USING btree (target_type, target_id) WHERE (status = 'PENDING'::app."APPROVAL_REQUEST_STATUS");

-- app.approval_requests_status_idx (INDEX)
CREATE INDEX approval_requests_status_idx ON app.approval_requests USING btree (status);

-- app.approval_requests_target_type_target_id_idx (INDEX)
CREATE INDEX approval_requests_target_type_target_id_idx ON app.approval_requests USING btree (target_type, target_id);

-- app.audit_logs_created_at_idx (INDEX)
CREATE INDEX audit_logs_created_at_idx ON app.audit_logs USING btree (created_at);

-- app.audit_logs_kiosk_device_id_idx (INDEX)
CREATE INDEX audit_logs_kiosk_device_id_idx ON app.audit_logs USING btree (kiosk_device_id);

-- app.audit_logs_table_name_record_id_idx (INDEX)
CREATE INDEX audit_logs_table_name_record_id_idx ON app.audit_logs USING btree (table_name, record_id);

-- app.billing_closings_customer_bp_id_closing_date_key (INDEX)
CREATE UNIQUE INDEX billing_closings_customer_bp_id_closing_date_key ON app.billing_closings USING btree (customer_bp_id, closing_date);

-- app.billing_closings_status_idx (INDEX)
CREATE INDEX billing_closings_status_idx ON app.billing_closings USING btree (status);

-- app.bp_contacts_bp_id_idx (INDEX)
CREATE INDEX bp_contacts_bp_id_idx ON app.bp_contacts USING btree (bp_id);

-- app.bp_customer_attrs_customer_code_key (INDEX)
CREATE UNIQUE INDEX bp_customer_attrs_customer_code_key ON app.bp_customer_attrs USING btree (customer_code);

-- app.bp_role_assignments_bp_id_role_key (INDEX)
CREATE UNIQUE INDEX bp_role_assignments_bp_id_role_key ON app.bp_role_assignments USING btree (bp_id, role);

-- app.bp_sales_reps_primary_uniq (INDEX)
CREATE UNIQUE INDEX bp_sales_reps_primary_uniq ON app.bp_sales_reps USING btree (bp_id) WHERE is_primary;

-- app.bp_sales_reps_user_id_idx (INDEX)
CREATE INDEX bp_sales_reps_user_id_idx ON app.bp_sales_reps USING btree (user_id);

-- app.bp_vendor_attrs_vendor_code_key (INDEX)
CREATE UNIQUE INDEX bp_vendor_attrs_vendor_code_key ON app.bp_vendor_attrs USING btree (vendor_code);

-- app.business_partners_bp_code_key (INDEX)
CREATE UNIQUE INDEX business_partners_bp_code_key ON app.business_partners USING btree (bp_code);

-- app.business_partners_match_names_auto_idx (INDEX)
CREATE INDEX business_partners_match_names_auto_idx ON app.business_partners USING gin (match_names_auto);

-- app.business_partners_parent_id_idx (INDEX)
CREATE INDEX business_partners_parent_id_idx ON app.business_partners USING btree (parent_id);

-- app.defect_records_work_order_step_id_idx (INDEX)
CREATE INDEX defect_records_work_order_step_id_idx ON app.defect_records USING btree (work_order_step_id);

-- app.defect_types_code_key (INDEX)
CREATE UNIQUE INDEX defect_types_code_key ON app.defect_types USING btree (code);

-- app.delivery_note_items_delivery_note_year_month_delivery_note__idx (INDEX)
CREATE INDEX delivery_note_items_delivery_note_year_month_delivery_note__idx ON app.delivery_note_items USING btree (delivery_note_year_month, delivery_note_seq);

-- app.delivery_notes_delivery_order_year_month_delivery_order_seq_idx (INDEX)
CREATE INDEX delivery_notes_delivery_order_year_month_delivery_order_seq_idx ON app.delivery_notes USING btree (delivery_order_year_month, delivery_order_seq);

-- app.delivery_order_items_delivery_order_year_month_delivery_ord_idx (INDEX)
CREATE INDEX delivery_order_items_delivery_order_year_month_delivery_ord_idx ON app.delivery_order_items USING btree (delivery_order_year_month, delivery_order_seq);

-- app.delivery_order_items_order_line_id_idx (INDEX)
CREATE INDEX delivery_order_items_order_line_id_idx ON app.delivery_order_items USING btree (order_line_id);

-- app.delivery_orders_customer_bp_id_idx (INDEX)
CREATE INDEX delivery_orders_customer_bp_id_idx ON app.delivery_orders USING btree (customer_bp_id);

-- app.delivery_orders_status_idx (INDEX)
CREATE INDEX delivery_orders_status_idx ON app.delivery_orders USING btree (status);

-- app.design_files_design_request_id_idx (INDEX)
CREATE INDEX design_files_design_request_id_idx ON app.design_files USING btree (design_request_id);

-- app.design_requests_request_number_key (INDEX)
CREATE UNIQUE INDEX design_requests_request_number_key ON app.design_requests USING btree (request_number);

-- app.design_requests_status_idx (INDEX)
CREATE INDEX design_requests_status_idx ON app.design_requests USING btree (status);

-- app.document_attachments_owner_type_owner_id_idx (INDEX)
CREATE INDEX document_attachments_owner_type_owner_id_idx ON app.document_attachments USING btree (owner_type, owner_id);

-- app.document_memo_revisions_memo_id_edited_at_idx (INDEX)
CREATE INDEX document_memo_revisions_memo_id_edited_at_idx ON app.document_memo_revisions USING btree (memo_id, edited_at);

-- app.document_memo_revisions_owner_type_owner_id_edited_at_idx (INDEX)
CREATE INDEX document_memo_revisions_owner_type_owner_id_edited_at_idx ON app.document_memo_revisions USING btree (owner_type, owner_id, edited_at);

-- app.document_memos_owner_type_owner_id_created_at_idx (INDEX)
CREATE INDEX document_memos_owner_type_owner_id_created_at_idx ON app.document_memos USING btree (owner_type, owner_id, created_at);

-- app.file_folder_grants_path_prefix_user_id_key (INDEX)
CREATE UNIQUE INDEX file_folder_grants_path_prefix_user_id_key ON app.file_folder_grants USING btree (path_prefix, user_id);

-- app.file_folder_grants_user_id_idx (INDEX)
CREATE INDEX file_folder_grants_user_id_idx ON app.file_folder_grants USING btree (user_id);

-- app.inspection_record_items_inspection_record_id_idx (INDEX)
CREATE INDEX inspection_record_items_inspection_record_id_idx ON app.inspection_record_items USING btree (inspection_record_id);

-- app.inspection_records_work_order_step_id_idx (INDEX)
CREATE INDEX inspection_records_work_order_step_id_idx ON app.inspection_records USING btree (work_order_step_id);

-- app.inspection_template_items_template_id_sort_order_idx (INDEX)
CREATE INDEX inspection_template_items_template_id_sort_order_idx ON app.inspection_template_items USING btree (template_id, sort_order);

-- app.inspection_templates_code_version_key (INDEX)
CREATE UNIQUE INDEX inspection_templates_code_version_key ON app.inspection_templates USING btree (code, version);

-- app.inventory_reservations_inventory_type_inventory_id_status_idx (INDEX)
CREATE INDEX inventory_reservations_inventory_type_inventory_id_status_idx ON app.inventory_reservations USING btree (inventory_type, inventory_id, status);

-- app.inventory_reservations_order_line_id_idx (INDEX)
CREATE INDEX inventory_reservations_order_line_id_idx ON app.inventory_reservations USING btree (order_line_id);

-- app.inventory_transactions_inventory_type_inventory_id_created__idx (INDEX)
CREATE INDEX inventory_transactions_inventory_type_inventory_id_created__idx ON app.inventory_transactions USING btree (inventory_type, inventory_id, created_at);

-- app.invoice_items_delivery_order_unique (INDEX)
CREATE UNIQUE INDEX invoice_items_delivery_order_unique ON app.invoice_items USING btree (delivery_order_year_month, delivery_order_seq) WHERE ((delivery_order_year_month IS NOT NULL) AND (delivery_order_seq IS NOT NULL));

-- app.invoice_items_invoice_year_month_invoice_seq_idx (INDEX)
CREATE INDEX invoice_items_invoice_year_month_invoice_seq_idx ON app.invoice_items USING btree (invoice_year_month, invoice_seq);

-- app.invoice_items_order_line_id_idx (INDEX)
CREATE INDEX invoice_items_order_line_id_idx ON app.invoice_items USING btree (order_line_id);

-- app.invoices_customer_bp_id_idx (INDEX)
CREATE INDEX invoices_customer_bp_id_idx ON app.invoices USING btree (customer_bp_id);

-- app.invoices_status_idx (INDEX)
CREATE INDEX invoices_status_idx ON app.invoices USING btree (status);

-- app.kiosk_cards_one_assigned_per_user (INDEX)
CREATE UNIQUE INDEX kiosk_cards_one_assigned_per_user ON app.kiosk_cards USING btree (user_id) WHERE (status = 'ASSIGNED'::app."KIOSK_CARD_STATUS");

-- app.kiosk_cards_user_id_idx (INDEX)
CREATE INDEX kiosk_cards_user_id_idx ON app.kiosk_cards USING btree (user_id);

-- app.kiosk_device_locations_device_id_recorded_at_idx (INDEX)
CREATE INDEX kiosk_device_locations_device_id_recorded_at_idx ON app.kiosk_device_locations USING btree (device_id, recorded_at DESC);

-- app.kiosk_device_logs_created_at_idx (INDEX)
CREATE INDEX kiosk_device_logs_created_at_idx ON app.kiosk_device_logs USING btree (created_at);

-- app.kiosk_device_logs_device_id_created_at_idx (INDEX)
CREATE INDEX kiosk_device_logs_device_id_created_at_idx ON app.kiosk_device_logs USING btree (device_id, created_at);

-- app.kiosk_devices_device_token_hash_key (INDEX)
CREATE UNIQUE INDEX kiosk_devices_device_token_hash_key ON app.kiosk_devices USING btree (device_token_hash);

-- app.kiosk_devices_fingerprint_key (INDEX)
CREATE UNIQUE INDEX kiosk_devices_fingerprint_key ON app.kiosk_devices USING btree (fingerprint);

-- app.kiosk_devices_plant_id_idx (INDEX)
CREATE INDEX kiosk_devices_plant_id_idx ON app.kiosk_devices USING btree (plant_id);

-- app.kiosk_devices_status_idx (INDEX)
CREATE INDEX kiosk_devices_status_idx ON app.kiosk_devices USING btree (status);

-- app.kiosk_floor_maps_plant_id_idx (INDEX)
CREATE INDEX kiosk_floor_maps_plant_id_idx ON app.kiosk_floor_maps USING btree (plant_id);

-- app.kiosk_link_requests_code_key (INDEX)
CREATE UNIQUE INDEX kiosk_link_requests_code_key ON app.kiosk_link_requests USING btree (code);

-- app.kiosk_link_requests_expires_at_idx (INDEX)
CREATE INDEX kiosk_link_requests_expires_at_idx ON app.kiosk_link_requests USING btree (expires_at);

-- app.kiosk_sessions_device_id_idx (INDEX)
CREATE INDEX kiosk_sessions_device_id_idx ON app.kiosk_sessions USING btree (device_id);

-- app.kiosk_sessions_expires_at_idx (INDEX)
CREATE INDEX kiosk_sessions_expires_at_idx ON app.kiosk_sessions USING btree (expires_at);

-- app.kiosk_sessions_user_id_idx (INDEX)
CREATE INDEX kiosk_sessions_user_id_idx ON app.kiosk_sessions USING btree (user_id);

-- app.link_blacklist_pattern_key (INDEX)
CREATE UNIQUE INDEX link_blacklist_pattern_key ON app.link_blacklist USING btree (pattern);

-- app.link_index_code_key (INDEX)
CREATE UNIQUE INDEX link_index_code_key ON app.link_index USING btree (code);

-- app.link_index_hostname_idx (INDEX)
CREATE INDEX link_index_hostname_idx ON app.link_index USING btree (hostname);

-- app.link_index_url_key (INDEX)
CREATE UNIQUE INDEX link_index_url_key ON app.link_index USING btree (url);

-- app.match_aliases_target_type_alias_key_key (INDEX)
CREATE UNIQUE INDEX match_aliases_target_type_alias_key_key ON app.match_aliases USING btree (target_type, alias_key);

-- app.match_aliases_target_type_target_id_idx (INDEX)
CREATE INDEX match_aliases_target_type_target_id_idx ON app.match_aliases USING btree (target_type, target_id);

-- app.material_inventory_bucket_key (INDEX)
CREATE UNIQUE INDEX material_inventory_bucket_key ON app.material_inventory USING btree (material_id, plant_id, storage_location_id, shelf_id) NULLS NOT DISTINCT;

-- app.material_inventory_material_id_idx (INDEX)
CREATE INDEX material_inventory_material_id_idx ON app.material_inventory USING btree (material_id);

-- app.material_purchase_order_items_material_id_idx (INDEX)
CREATE INDEX material_purchase_order_items_material_id_idx ON app.material_purchase_order_items USING btree (material_id);

-- app.material_purchase_order_items_purchase_order_id_idx (INDEX)
CREATE INDEX material_purchase_order_items_purchase_order_id_idx ON app.material_purchase_order_items USING btree (purchase_order_id);

-- app.material_purchase_orders_po_number_key (INDEX)
CREATE UNIQUE INDEX material_purchase_orders_po_number_key ON app.material_purchase_orders USING btree (po_number);

-- app.material_purchase_orders_status_idx (INDEX)
CREATE INDEX material_purchase_orders_status_idx ON app.material_purchase_orders USING btree (status);

-- app.material_purchase_orders_supplier_bp_id_idx (INDEX)
CREATE INDEX material_purchase_orders_supplier_bp_id_idx ON app.material_purchase_orders USING btree (supplier_bp_id);

-- app.material_receipts_material_id_received_at_idx (INDEX)
CREATE INDEX material_receipts_material_id_received_at_idx ON app.material_receipts USING btree (material_id, received_at);

-- app.material_type_prices_material_type_id_diameter_code_surface_key (INDEX)
CREATE UNIQUE INDEX material_type_prices_material_type_id_diameter_code_surface_key ON app.material_type_prices USING btree (material_type_id, diameter_code, surface_finish_code);

-- app.material_types_code_key (INDEX)
CREATE UNIQUE INDEX material_types_code_key ON app.material_types USING btree (code);

-- app.material_types_legacy_key_key (INDEX)
CREATE UNIQUE INDEX material_types_legacy_key_key ON app.material_types USING btree (legacy_key);

-- app.material_types_manufacturer_code_grade_code_shape_code_kind_key (INDEX)
CREATE UNIQUE INDEX material_types_manufacturer_code_grade_code_shape_code_kind_key ON app.material_types USING btree (manufacturer_code, grade_code, shape_code, kind_code);

-- app.materials_code_key (INDEX)
CREATE UNIQUE INDEX materials_code_key ON app.materials USING btree (code);

-- app.materials_match_names_idx (INDEX)
CREATE INDEX materials_match_names_idx ON app.materials USING gin (match_names);

-- app.materials_material_type_id_surface_finish_code_diameter_cod_key (INDEX)
CREATE UNIQUE INDEX materials_material_type_id_surface_finish_code_diameter_cod_key ON app.materials USING btree (material_type_id, surface_finish_code, diameter_code, length_variant_code);

-- app.notifications_user_id_is_read_created_at_idx (INDEX)
CREATE INDEX notifications_user_id_is_read_created_at_idx ON app.notifications USING btree (user_id, is_read, created_at DESC);

-- app.order_acceptance_cancel_requests_acceptance_year_month_acce_idx (INDEX)
CREATE INDEX order_acceptance_cancel_requests_acceptance_year_month_acce_idx ON app.order_acceptance_cancel_requests USING btree (acceptance_year_month, acceptance_seq, status);

-- app.order_acceptance_cancel_requests_one_pending (INDEX)
CREATE UNIQUE INDEX order_acceptance_cancel_requests_one_pending ON app.order_acceptance_cancel_requests USING btree (acceptance_year_month, acceptance_seq) WHERE (status = 'PENDING'::text);

-- app.order_acceptances_customer_bp_id_idx (INDEX)
CREATE INDEX order_acceptances_customer_bp_id_idx ON app.order_acceptances USING btree (customer_bp_id);

-- app.order_acceptances_status_idx (INDEX)
CREATE INDEX order_acceptances_status_idx ON app.order_acceptances USING btree (status);

-- app.order_lines_acceptance_year_month_acceptance_seq_branch_key (INDEX)
CREATE UNIQUE INDEX order_lines_acceptance_year_month_acceptance_seq_branch_key ON app.order_lines USING btree (acceptance_year_month, acceptance_seq, branch);

-- app.order_lines_acceptance_year_month_acceptance_seq_idx (INDEX)
CREATE INDEX order_lines_acceptance_year_month_acceptance_seq_idx ON app.order_lines USING btree (acceptance_year_month, acceptance_seq);

-- app.order_lines_lot_number_idx (INDEX)
CREATE INDEX order_lines_lot_number_idx ON app.order_lines USING btree (lot_number);

-- app.order_lines_product_id_idx (INDEX)
CREATE INDEX order_lines_product_id_idx ON app.order_lines USING btree (product_id);

-- app.order_lines_status_idx (INDEX)
CREATE INDEX order_lines_status_idx ON app.order_lines USING btree (status);

-- app.plants_code_key (INDEX)
CREATE UNIQUE INDEX plants_code_key ON app.plants USING btree (code);

-- app.plants_region_id_idx (INDEX)
CREATE INDEX plants_region_id_idx ON app.plants USING btree (region_id);

-- app.price_list_discounts_variant_id_idx (INDEX)
CREATE INDEX price_list_discounts_variant_id_idx ON app.price_list_discounts USING btree (variant_id);

-- app.price_list_entries_customer_bp_id_product_id_key (INDEX)
CREATE UNIQUE INDEX price_list_entries_customer_bp_id_product_id_key ON app.price_list_entries USING btree (customer_bp_id, product_id);

-- app.price_list_tiers_variant_id_min_quantity_idx (INDEX)
CREATE INDEX price_list_tiers_variant_id_min_quantity_idx ON app.price_list_tiers USING btree (variant_id, min_quantity);

-- app.price_list_variants_entry_year_month_entry_seq_order_type_key (INDEX)
CREATE UNIQUE INDEX price_list_variants_entry_year_month_entry_seq_order_type_key ON app.price_list_variants USING btree (entry_year_month, entry_seq, order_type);

-- app.process_step_catalog_code_key (INDEX)
CREATE UNIQUE INDEX process_step_catalog_code_key ON app.process_step_catalog USING btree (code);

-- app.process_step_work_locations_process_step_id_idx (INDEX)
CREATE INDEX process_step_work_locations_process_step_id_idx ON app.process_step_work_locations USING btree (process_step_id);

-- app.process_step_work_locations_work_location_id_idx (INDEX)
CREATE INDEX process_step_work_locations_work_location_id_idx ON app.process_step_work_locations USING btree (work_location_id);

-- app.product_inventory_bucket_key (INDEX)
CREATE UNIQUE INDEX product_inventory_bucket_key ON app.product_inventory USING btree (product_id, plant_id, lot_number, is_semi_finished, storage_location_id, shelf_id) NULLS NOT DISTINCT;

-- app.product_inventory_product_id_idx (INDEX)
CREATE INDEX product_inventory_product_id_idx ON app.product_inventory USING btree (product_id);

-- app.product_process_route_version_steps_route_version_id_proces_key (INDEX)
CREATE UNIQUE INDEX product_process_route_version_steps_route_version_id_proces_key ON app.product_process_route_version_steps USING btree (route_version_id, process_step_id);

-- app.product_process_route_version_steps_route_version_id_sort_o_idx (INDEX)
CREATE INDEX product_process_route_version_steps_route_version_id_sort_o_idx ON app.product_process_route_version_steps USING btree (route_version_id, sort_order);

-- app.product_process_route_versions_route_id_version_key (INDEX)
CREATE UNIQUE INDEX product_process_route_versions_route_id_version_key ON app.product_process_route_versions USING btree (route_id, version);

-- app.product_process_routes_product_id_customer_bp_id_idx (INDEX)
CREATE INDEX product_process_routes_product_id_customer_bp_id_idx ON app.product_process_routes USING btree (product_id, customer_bp_id);

-- app.product_process_routes_product_id_idx (INDEX)
CREATE INDEX product_process_routes_product_id_idx ON app.product_process_routes USING btree (product_id);

-- app.products_legacy_key_key (INDEX)
CREATE UNIQUE INDEX products_legacy_key_key ON app.products USING btree (legacy_key);

-- app.products_match_names_idx (INDEX)
CREATE INDEX products_match_names_idx ON app.products USING gin (match_names);

-- app.products_material_type_id_idx (INDEX)
CREATE INDEX products_material_type_id_idx ON app.products USING btree (material_type_id);

-- app.products_year_month_seq_key (INDEX)
CREATE UNIQUE INDEX products_year_month_seq_key ON app.products USING btree (year_month, seq);

-- app.purchase_request_items_request_id_idx (INDEX)
CREATE INDEX purchase_request_items_request_id_idx ON app.purchase_request_items USING btree (request_id);

-- app.purchase_requests_purchase_order_id_key (INDEX)
CREATE UNIQUE INDEX purchase_requests_purchase_order_id_key ON app.purchase_requests USING btree (purchase_order_id);

-- app.purchase_requests_request_number_key (INDEX)
CREATE UNIQUE INDEX purchase_requests_request_number_key ON app.purchase_requests USING btree (request_number);

-- app.purchase_requests_status_idx (INDEX)
CREATE INDEX purchase_requests_status_idx ON app.purchase_requests USING btree (status);

-- app.push_subscriptions_endpoint_key (INDEX)
CREATE UNIQUE INDEX push_subscriptions_endpoint_key ON app.push_subscriptions USING btree (endpoint);

-- app.push_subscriptions_user_id_idx (INDEX)
CREATE INDEX push_subscriptions_user_id_idx ON app.push_subscriptions USING btree (user_id);

-- app.regions_code_key (INDEX)
CREATE UNIQUE INDEX regions_code_key ON app.regions USING btree (code);

-- app.roles_rolename_key (INDEX)
CREATE UNIQUE INDEX roles_rolename_key ON app.roles USING btree (rolename);

-- app.storage_locations_code_key (INDEX)
CREATE UNIQUE INDEX storage_locations_code_key ON app.storage_locations USING btree (code);

-- app.storage_locations_plant_id_idx (INDEX)
CREATE INDEX storage_locations_plant_id_idx ON app.storage_locations USING btree (plant_id);

-- app.storage_shelves_location_id_code_key (INDEX)
CREATE UNIQUE INDEX storage_shelves_location_id_code_key ON app.storage_shelves USING btree (location_id, code);

-- app.user_plants_plant_id_idx (INDEX)
CREATE INDEX user_plants_plant_id_idx ON app.user_plants USING btree (plant_id);

-- app.users_avatar_file_id_idx (INDEX)
CREATE INDEX users_avatar_file_id_idx ON app.users USING btree (avatar_file_id);

-- app.users_avatar_thumb_file_id_idx (INDEX)
CREATE INDEX users_avatar_thumb_file_id_idx ON app.users USING btree (avatar_thumb_file_id);

-- app.users_employee_id_key (INDEX)
CREATE UNIQUE INDEX users_employee_id_key ON app.users USING btree (employee_id);

-- app.users_username_key (INDEX)
CREATE UNIQUE INDEX users_username_key ON app.users USING btree (username);

-- app.work_location_groups_code_key (INDEX)
CREATE UNIQUE INDEX work_location_groups_code_key ON app.work_location_groups USING btree (code);

-- app.work_location_groups_type_key_idx (INDEX)
CREATE INDEX work_location_groups_type_key_idx ON app.work_location_groups USING btree (type_key);

-- app.work_locations_code_key (INDEX)
CREATE UNIQUE INDEX work_locations_code_key ON app.work_locations USING btree (code);

-- app.work_locations_group_id_sort_order_idx (INDEX)
CREATE INDEX work_locations_group_id_sort_order_idx ON app.work_locations USING btree (group_id, sort_order);

-- app.work_order_flow_changes_one_pending (INDEX)
CREATE UNIQUE INDEX work_order_flow_changes_one_pending ON app.work_order_flow_changes USING btree (work_order_id) WHERE (status = 'PENDING'::text);

-- app.work_order_flow_changes_work_order_id_status_idx (INDEX)
CREATE INDEX work_order_flow_changes_work_order_id_status_idx ON app.work_order_flow_changes USING btree (work_order_id, status);

-- app.work_order_links_source_work_order_id_target_work_order_id_key (INDEX)
CREATE UNIQUE INDEX work_order_links_source_work_order_id_target_work_order_id_key ON app.work_order_links USING btree (source_work_order_id, target_work_order_id);

-- app.work_order_links_target_work_order_id_idx (INDEX)
CREATE INDEX work_order_links_target_work_order_id_idx ON app.work_order_links USING btree (target_work_order_id);

-- app.work_order_order_lines_order_line_id_idx (INDEX)
CREATE INDEX work_order_order_lines_order_line_id_idx ON app.work_order_order_lines USING btree (order_line_id);

-- app.work_order_step_actuals_user_id_worked_date_idx (INDEX)
CREATE INDEX work_order_step_actuals_user_id_worked_date_idx ON app.work_order_step_actuals USING btree (user_id, worked_date);

-- app.work_order_step_actuals_work_order_step_id_worked_date_idx (INDEX)
CREATE INDEX work_order_step_actuals_work_order_step_id_worked_date_idx ON app.work_order_step_actuals USING btree (work_order_step_id, worked_date);

-- app.work_order_step_links_source_step_id_target_step_id_key (INDEX)
CREATE UNIQUE INDEX work_order_step_links_source_step_id_target_step_id_key ON app.work_order_step_links USING btree (source_step_id, target_step_id);

-- app.work_order_step_plans_user_id_planned_date_idx (INDEX)
CREATE INDEX work_order_step_plans_user_id_planned_date_idx ON app.work_order_step_plans USING btree (user_id, planned_date);

-- app.work_order_step_plans_work_order_step_id_planned_date_idx (INDEX)
CREATE INDEX work_order_step_plans_work_order_step_id_planned_date_idx ON app.work_order_step_plans USING btree (work_order_step_id, planned_date);

-- app.work_order_steps_status_idx (INDEX)
CREATE INDEX work_order_steps_status_idx ON app.work_order_steps USING btree (status);

-- app.work_order_steps_work_order_id_sort_order_idx (INDEX)
CREATE INDEX work_order_steps_work_order_id_sort_order_idx ON app.work_order_steps USING btree (work_order_id, sort_order);

-- app.work_orders_approval_status_idx (INDEX)
CREATE INDEX work_orders_approval_status_idx ON app.work_orders USING btree (approval_status);

-- app.work_orders_product_id_idx (INDEX)
CREATE INDEX work_orders_product_id_idx ON app.work_orders USING btree (product_id);

-- app.work_orders_route_version_id_idx (INDEX)
CREATE INDEX work_orders_route_version_id_idx ON app.work_orders USING btree (route_version_id);

-- app.work_orders_status_idx (INDEX)
CREATE INDEX work_orders_status_idx ON app.work_orders USING btree (status);

-- app.work_orders_storage_location_id_idx (INDEX)
CREATE INDEX work_orders_storage_location_id_idx ON app.work_orders USING btree (storage_location_id);

-- app.work_orders_work_order_number_key (INDEX)
CREATE UNIQUE INDEX work_orders_work_order_number_key ON app.work_orders USING btree (work_order_number);

-- app.work_orders_year_month_seq_key (INDEX)
CREATE UNIQUE INDEX work_orders_year_month_seq_key ON app.work_orders USING btree (year_month, seq);

-- directory.employee_directory_ldap_guid_key (INDEX)
CREATE UNIQUE INDEX employee_directory_ldap_guid_key ON directory.employee_directory USING btree (ldap_guid);

-- directory.idx_ldap_sync_log_finished (INDEX)
CREATE INDEX idx_ldap_sync_log_finished ON directory.ldap_sync_log USING btree (finished_at DESC);

-- app.approval_delegates approval_delegates_created_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.approval_delegates
    ADD CONSTRAINT approval_delegates_created_by_fkey FOREIGN KEY (created_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.approval_delegates approval_delegates_delegate_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.approval_delegates
    ADD CONSTRAINT approval_delegates_delegate_id_fkey FOREIGN KEY (delegate_id) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.approval_delegates approval_delegates_delegator_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.approval_delegates
    ADD CONSTRAINT approval_delegates_delegator_id_fkey FOREIGN KEY (delegator_id) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.approval_delegates approval_delegates_group_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.approval_delegates
    ADD CONSTRAINT approval_delegates_group_id_fkey FOREIGN KEY (group_id) REFERENCES app.approval_groups(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- app.approval_flow_rule_steps approval_flow_rule_steps_group_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.approval_flow_rule_steps
    ADD CONSTRAINT approval_flow_rule_steps_group_id_fkey FOREIGN KEY (group_id) REFERENCES app.approval_groups(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.approval_flow_rule_steps approval_flow_rule_steps_rule_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.approval_flow_rule_steps
    ADD CONSTRAINT approval_flow_rule_steps_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES app.approval_flow_rules(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- app.approval_flow_rules approval_flow_rules_target_type_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.approval_flow_rules
    ADD CONSTRAINT approval_flow_rules_target_type_fkey FOREIGN KEY (target_type) REFERENCES app.approval_flows(target_type) ON UPDATE CASCADE ON DELETE CASCADE;

-- app.approval_flow_rules approval_flow_rules_updated_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.approval_flow_rules
    ADD CONSTRAINT approval_flow_rules_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.approval_flow_steps approval_flow_steps_group_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.approval_flow_steps
    ADD CONSTRAINT approval_flow_steps_group_id_fkey FOREIGN KEY (group_id) REFERENCES app.approval_groups(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.approval_flow_steps approval_flow_steps_target_type_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.approval_flow_steps
    ADD CONSTRAINT approval_flow_steps_target_type_fkey FOREIGN KEY (target_type) REFERENCES app.approval_flows(target_type) ON UPDATE CASCADE ON DELETE CASCADE;

-- app.approval_flows approval_flows_updated_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.approval_flows
    ADD CONSTRAINT approval_flows_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.approval_group_members approval_group_members_group_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.approval_group_members
    ADD CONSTRAINT approval_group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES app.approval_groups(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- app.approval_group_members approval_group_members_user_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.approval_group_members
    ADD CONSTRAINT approval_group_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.approval_records approval_records_approval_request_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.approval_records
    ADD CONSTRAINT approval_records_approval_request_id_fkey FOREIGN KEY (approval_request_id) REFERENCES app.approval_requests(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- app.approval_records approval_records_approver_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.approval_records
    ADD CONSTRAINT approval_records_approver_id_fkey FOREIGN KEY (approver_id) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.approval_records approval_records_delegate_for_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.approval_records
    ADD CONSTRAINT approval_records_delegate_for_id_fkey FOREIGN KEY (delegate_for_id) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.approval_request_approvers approval_request_approvers_acted_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.approval_request_approvers
    ADD CONSTRAINT approval_request_approvers_acted_by_fkey FOREIGN KEY (acted_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.approval_request_approvers approval_request_approvers_approval_request_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.approval_request_approvers
    ADD CONSTRAINT approval_request_approvers_approval_request_id_fkey FOREIGN KEY (approval_request_id) REFERENCES app.approval_requests(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- app.approval_request_approvers approval_request_approvers_user_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.approval_request_approvers
    ADD CONSTRAINT approval_request_approvers_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.approval_requests approval_requests_group_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.approval_requests
    ADD CONSTRAINT approval_requests_group_id_fkey FOREIGN KEY (group_id) REFERENCES app.approval_groups(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.approval_requests approval_requests_requested_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.approval_requests
    ADD CONSTRAINT approval_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.audit_logs audit_logs_kiosk_device_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.audit_logs
    ADD CONSTRAINT audit_logs_kiosk_device_id_fkey FOREIGN KEY (kiosk_device_id) REFERENCES app.kiosk_devices(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.audit_logs audit_logs_user_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.billing_closings billing_closings_customer_bp_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.billing_closings
    ADD CONSTRAINT billing_closings_customer_bp_id_fkey FOREIGN KEY (customer_bp_id) REFERENCES app.business_partners(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.bp_contacts bp_contacts_bp_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.bp_contacts
    ADD CONSTRAINT bp_contacts_bp_id_fkey FOREIGN KEY (bp_id) REFERENCES app.business_partners(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.bp_customer_attrs bp_customer_attrs_billing_bp_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.bp_customer_attrs
    ADD CONSTRAINT bp_customer_attrs_billing_bp_id_fkey FOREIGN KEY (billing_bp_id) REFERENCES app.business_partners(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.bp_customer_attrs bp_customer_attrs_bp_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.bp_customer_attrs
    ADD CONSTRAINT bp_customer_attrs_bp_id_fkey FOREIGN KEY (bp_id) REFERENCES app.business_partners(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.bp_end_user_attrs bp_end_user_attrs_bp_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.bp_end_user_attrs
    ADD CONSTRAINT bp_end_user_attrs_bp_id_fkey FOREIGN KEY (bp_id) REFERENCES app.business_partners(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.bp_role_assignments bp_role_assignments_bp_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.bp_role_assignments
    ADD CONSTRAINT bp_role_assignments_bp_id_fkey FOREIGN KEY (bp_id) REFERENCES app.business_partners(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.bp_sales_reps bp_sales_reps_bp_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.bp_sales_reps
    ADD CONSTRAINT bp_sales_reps_bp_id_fkey FOREIGN KEY (bp_id) REFERENCES app.business_partners(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- app.bp_sales_reps bp_sales_reps_user_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.bp_sales_reps
    ADD CONSTRAINT bp_sales_reps_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.bp_vendor_attrs bp_vendor_attrs_bp_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.bp_vendor_attrs
    ADD CONSTRAINT bp_vendor_attrs_bp_id_fkey FOREIGN KEY (bp_id) REFERENCES app.business_partners(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.business_partners business_partners_created_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.business_partners
    ADD CONSTRAINT business_partners_created_by_fkey FOREIGN KEY (created_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.business_partners business_partners_parent_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.business_partners
    ADD CONSTRAINT business_partners_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES app.business_partners(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.defect_records defect_records_defect_type_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.defect_records
    ADD CONSTRAINT defect_records_defect_type_id_fkey FOREIGN KEY (defect_type_id) REFERENCES app.defect_types(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.defect_records defect_records_work_order_step_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.defect_records
    ADD CONSTRAINT defect_records_work_order_step_id_fkey FOREIGN KEY (work_order_step_id) REFERENCES app.work_order_steps(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- app.delivery_note_items delivery_note_items_delivery_note_year_month_delivery_note_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.delivery_note_items
    ADD CONSTRAINT delivery_note_items_delivery_note_year_month_delivery_note_fkey FOREIGN KEY (delivery_note_year_month, delivery_note_seq) REFERENCES app.delivery_notes(year_month, seq) ON UPDATE CASCADE ON DELETE CASCADE;

-- app.delivery_note_items delivery_note_items_product_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.delivery_note_items
    ADD CONSTRAINT delivery_note_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES app.products(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.delivery_notes delivery_notes_created_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.delivery_notes
    ADD CONSTRAINT delivery_notes_created_by_fkey FOREIGN KEY (created_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.delivery_notes delivery_notes_delivery_order_year_month_delivery_order_se_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.delivery_notes
    ADD CONSTRAINT delivery_notes_delivery_order_year_month_delivery_order_se_fkey FOREIGN KEY (delivery_order_year_month, delivery_order_seq) REFERENCES app.delivery_orders(year_month, seq) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.delivery_notes delivery_notes_end_user_bp_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.delivery_notes
    ADD CONSTRAINT delivery_notes_end_user_bp_id_fkey FOREIGN KEY (end_user_bp_id) REFERENCES app.business_partners(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.delivery_notes delivery_notes_pdf_file_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.delivery_notes
    ADD CONSTRAINT delivery_notes_pdf_file_id_fkey FOREIGN KEY (pdf_file_id) REFERENCES app.files(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.delivery_notes delivery_notes_recipient_bp_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.delivery_notes
    ADD CONSTRAINT delivery_notes_recipient_bp_id_fkey FOREIGN KEY (recipient_bp_id) REFERENCES app.business_partners(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.delivery_notes delivery_notes_recipient_branch_bp_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.delivery_notes
    ADD CONSTRAINT delivery_notes_recipient_branch_bp_id_fkey FOREIGN KEY (recipient_branch_bp_id) REFERENCES app.business_partners(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.delivery_notes delivery_notes_sales_rep_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.delivery_notes
    ADD CONSTRAINT delivery_notes_sales_rep_id_fkey FOREIGN KEY (sales_rep_id) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.delivery_order_items delivery_order_items_delivery_order_year_month_delivery_or_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.delivery_order_items
    ADD CONSTRAINT delivery_order_items_delivery_order_year_month_delivery_or_fkey FOREIGN KEY (delivery_order_year_month, delivery_order_seq) REFERENCES app.delivery_orders(year_month, seq) ON UPDATE CASCADE ON DELETE CASCADE;

-- app.delivery_order_items delivery_order_items_order_line_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.delivery_order_items
    ADD CONSTRAINT delivery_order_items_order_line_id_fkey FOREIGN KEY (order_line_id) REFERENCES app.order_lines(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.delivery_order_items delivery_order_items_product_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.delivery_order_items
    ADD CONSTRAINT delivery_order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES app.products(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.delivery_orders delivery_orders_created_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.delivery_orders
    ADD CONSTRAINT delivery_orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.delivery_orders delivery_orders_customer_bp_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.delivery_orders
    ADD CONSTRAINT delivery_orders_customer_bp_id_fkey FOREIGN KEY (customer_bp_id) REFERENCES app.business_partners(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.delivery_orders delivery_orders_customer_branch_bp_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.delivery_orders
    ADD CONSTRAINT delivery_orders_customer_branch_bp_id_fkey FOREIGN KEY (customer_branch_bp_id) REFERENCES app.business_partners(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.delivery_orders delivery_orders_from_plant_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.delivery_orders
    ADD CONSTRAINT delivery_orders_from_plant_id_fkey FOREIGN KEY (from_plant_id) REFERENCES app.plants(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.delivery_orders delivery_orders_work_order_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.delivery_orders
    ADD CONSTRAINT delivery_orders_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES app.work_orders(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.design_files design_files_created_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.design_files
    ADD CONSTRAINT design_files_created_by_fkey FOREIGN KEY (created_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.design_files design_files_design_request_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.design_files
    ADD CONSTRAINT design_files_design_request_id_fkey FOREIGN KEY (design_request_id) REFERENCES app.design_requests(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.design_files design_files_file_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.design_files
    ADD CONSTRAINT design_files_file_id_fkey FOREIGN KEY (file_id) REFERENCES app.files(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.design_files design_files_product_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.design_files
    ADD CONSTRAINT design_files_product_id_fkey FOREIGN KEY (product_id) REFERENCES app.products(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.design_requests design_requests_created_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.design_requests
    ADD CONSTRAINT design_requests_created_by_fkey FOREIGN KEY (created_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.design_requests design_requests_order_line_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.design_requests
    ADD CONSTRAINT design_requests_order_line_id_fkey FOREIGN KEY (order_line_id) REFERENCES app.order_lines(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.design_requests design_requests_product_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.design_requests
    ADD CONSTRAINT design_requests_product_id_fkey FOREIGN KEY (product_id) REFERENCES app.products(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.design_requests design_requests_quote_year_month_quote_seq_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.design_requests
    ADD CONSTRAINT design_requests_quote_year_month_quote_seq_fkey FOREIGN KEY (quote_year_month, quote_seq) REFERENCES app.quotes(year_month, seq) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.document_attachments document_attachments_file_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.document_attachments
    ADD CONSTRAINT document_attachments_file_id_fkey FOREIGN KEY (file_id) REFERENCES app.files(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.document_attachments document_attachments_uploaded_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.document_attachments
    ADD CONSTRAINT document_attachments_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.document_memo_revisions document_memo_revisions_edited_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.document_memo_revisions
    ADD CONSTRAINT document_memo_revisions_edited_by_fkey FOREIGN KEY (edited_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.document_memo_revisions document_memo_revisions_memo_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.document_memo_revisions
    ADD CONSTRAINT document_memo_revisions_memo_id_fkey FOREIGN KEY (memo_id) REFERENCES app.document_memos(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.document_memos document_memos_archived_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.document_memos
    ADD CONSTRAINT document_memos_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.document_memos document_memos_created_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.document_memos
    ADD CONSTRAINT document_memos_created_by_fkey FOREIGN KEY (created_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.document_memos document_memos_updated_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.document_memos
    ADD CONSTRAINT document_memos_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.estimates estimates_created_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.estimates
    ADD CONSTRAINT estimates_created_by_fkey FOREIGN KEY (created_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.estimates estimates_customer_bp_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.estimates
    ADD CONSTRAINT estimates_customer_bp_id_fkey FOREIGN KEY (customer_bp_id) REFERENCES app.business_partners(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.estimates estimates_diameter_code_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.estimates
    ADD CONSTRAINT estimates_diameter_code_fkey FOREIGN KEY (diameter_code) REFERENCES app.material_diameters(code) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.estimates estimates_material_type_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.estimates
    ADD CONSTRAINT estimates_material_type_id_fkey FOREIGN KEY (material_type_id) REFERENCES app.material_types(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.estimates estimates_product_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.estimates
    ADD CONSTRAINT estimates_product_id_fkey FOREIGN KEY (product_id) REFERENCES app.products(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.estimates estimates_sales_rep_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.estimates
    ADD CONSTRAINT estimates_sales_rep_id_fkey FOREIGN KEY (sales_rep_id) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.estimates estimates_surface_finish_code_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.estimates
    ADD CONSTRAINT estimates_surface_finish_code_fkey FOREIGN KEY (surface_finish_code) REFERENCES app.material_surface_finishes(code) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.feature_flags feature_flags_updated_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.feature_flags
    ADD CONSTRAINT feature_flags_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.file_folder_grants file_folder_grants_created_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.file_folder_grants
    ADD CONSTRAINT file_folder_grants_created_by_fkey FOREIGN KEY (created_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.file_folder_grants file_folder_grants_user_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.file_folder_grants
    ADD CONSTRAINT file_folder_grants_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- app.files files_uploaded_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.files
    ADD CONSTRAINT files_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.inspection_record_items inspection_record_items_inspection_record_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.inspection_record_items
    ADD CONSTRAINT inspection_record_items_inspection_record_id_fkey FOREIGN KEY (inspection_record_id) REFERENCES app.inspection_records(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- app.inspection_record_items inspection_record_items_template_item_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.inspection_record_items
    ADD CONSTRAINT inspection_record_items_template_item_id_fkey FOREIGN KEY (template_item_id) REFERENCES app.inspection_template_items(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.inspection_records inspection_records_template_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.inspection_records
    ADD CONSTRAINT inspection_records_template_id_fkey FOREIGN KEY (template_id) REFERENCES app.inspection_templates(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.inspection_records inspection_records_work_order_step_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.inspection_records
    ADD CONSTRAINT inspection_records_work_order_step_id_fkey FOREIGN KEY (work_order_step_id) REFERENCES app.work_order_steps(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- app.inspection_template_items inspection_template_items_template_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.inspection_template_items
    ADD CONSTRAINT inspection_template_items_template_id_fkey FOREIGN KEY (template_id) REFERENCES app.inspection_templates(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- app.inspection_templates inspection_templates_related_process_step_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.inspection_templates
    ADD CONSTRAINT inspection_templates_related_process_step_id_fkey FOREIGN KEY (related_process_step_id) REFERENCES app.process_step_catalog(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.inventory_reservations inventory_reservations_order_line_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.inventory_reservations
    ADD CONSTRAINT inventory_reservations_order_line_id_fkey FOREIGN KEY (order_line_id) REFERENCES app.order_lines(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.inventory_reservations inventory_reservations_work_order_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.inventory_reservations
    ADD CONSTRAINT inventory_reservations_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES app.work_orders(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.invoice_items invoice_items_invoice_year_month_invoice_seq_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.invoice_items
    ADD CONSTRAINT invoice_items_invoice_year_month_invoice_seq_fkey FOREIGN KEY (invoice_year_month, invoice_seq) REFERENCES app.invoices(year_month, seq) ON UPDATE CASCADE ON DELETE CASCADE;

-- app.invoice_items invoice_items_order_line_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.invoice_items
    ADD CONSTRAINT invoice_items_order_line_id_fkey FOREIGN KEY (order_line_id) REFERENCES app.order_lines(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.invoices invoices_created_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.invoices
    ADD CONSTRAINT invoices_created_by_fkey FOREIGN KEY (created_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.invoices invoices_customer_bp_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.invoices
    ADD CONSTRAINT invoices_customer_bp_id_fkey FOREIGN KEY (customer_bp_id) REFERENCES app.business_partners(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.invoices invoices_customer_branch_bp_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.invoices
    ADD CONSTRAINT invoices_customer_branch_bp_id_fkey FOREIGN KEY (customer_branch_bp_id) REFERENCES app.business_partners(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.invoices invoices_pdf_file_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.invoices
    ADD CONSTRAINT invoices_pdf_file_id_fkey FOREIGN KEY (pdf_file_id) REFERENCES app.files(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.invoices invoices_sales_rep_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.invoices
    ADD CONSTRAINT invoices_sales_rep_id_fkey FOREIGN KEY (sales_rep_id) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.kiosk_cards kiosk_cards_assigned_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.kiosk_cards
    ADD CONSTRAINT kiosk_cards_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.kiosk_cards kiosk_cards_revoked_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.kiosk_cards
    ADD CONSTRAINT kiosk_cards_revoked_by_fkey FOREIGN KEY (revoked_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.kiosk_cards kiosk_cards_user_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.kiosk_cards
    ADD CONSTRAINT kiosk_cards_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.kiosk_device_locations kiosk_device_locations_device_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.kiosk_device_locations
    ADD CONSTRAINT kiosk_device_locations_device_id_fkey FOREIGN KEY (device_id) REFERENCES app.kiosk_devices(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- app.kiosk_device_logs kiosk_device_logs_device_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.kiosk_device_logs
    ADD CONSTRAINT kiosk_device_logs_device_id_fkey FOREIGN KEY (device_id) REFERENCES app.kiosk_devices(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- app.kiosk_device_logs kiosk_device_logs_user_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.kiosk_device_logs
    ADD CONSTRAINT kiosk_device_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.kiosk_devices kiosk_devices_activated_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.kiosk_devices
    ADD CONSTRAINT kiosk_devices_activated_by_fkey FOREIGN KEY (activated_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.kiosk_devices kiosk_devices_default_work_location_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.kiosk_devices
    ADD CONSTRAINT kiosk_devices_default_work_location_id_fkey FOREIGN KEY (default_work_location_id) REFERENCES app.work_locations(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.kiosk_devices kiosk_devices_floor_map_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.kiosk_devices
    ADD CONSTRAINT kiosk_devices_floor_map_id_fkey FOREIGN KEY (floor_map_id) REFERENCES app.kiosk_floor_maps(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.kiosk_devices kiosk_devices_plant_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.kiosk_devices
    ADD CONSTRAINT kiosk_devices_plant_id_fkey FOREIGN KEY (plant_id) REFERENCES app.plants(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.kiosk_floor_maps kiosk_floor_maps_file_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.kiosk_floor_maps
    ADD CONSTRAINT kiosk_floor_maps_file_id_fkey FOREIGN KEY (file_id) REFERENCES app.files(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.kiosk_floor_maps kiosk_floor_maps_plant_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.kiosk_floor_maps
    ADD CONSTRAINT kiosk_floor_maps_plant_id_fkey FOREIGN KEY (plant_id) REFERENCES app.plants(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.kiosk_link_requests kiosk_link_requests_device_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.kiosk_link_requests
    ADD CONSTRAINT kiosk_link_requests_device_id_fkey FOREIGN KEY (device_id) REFERENCES app.kiosk_devices(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.kiosk_sessions kiosk_sessions_card_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.kiosk_sessions
    ADD CONSTRAINT kiosk_sessions_card_id_fkey FOREIGN KEY (card_id) REFERENCES app.kiosk_cards(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.kiosk_sessions kiosk_sessions_device_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.kiosk_sessions
    ADD CONSTRAINT kiosk_sessions_device_id_fkey FOREIGN KEY (device_id) REFERENCES app.kiosk_devices(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.kiosk_sessions kiosk_sessions_user_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.kiosk_sessions
    ADD CONSTRAINT kiosk_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.link_blacklist link_blacklist_created_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.link_blacklist
    ADD CONSTRAINT link_blacklist_created_by_fkey FOREIGN KEY (created_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.link_index link_index_created_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.link_index
    ADD CONSTRAINT link_index_created_by_fkey FOREIGN KEY (created_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.match_aliases match_aliases_created_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.match_aliases
    ADD CONSTRAINT match_aliases_created_by_fkey FOREIGN KEY (created_by) REFERENCES app.users(id);

-- app.material_inventory material_inventory_material_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.material_inventory
    ADD CONSTRAINT material_inventory_material_id_fkey FOREIGN KEY (material_id) REFERENCES app.materials(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.material_inventory material_inventory_plant_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.material_inventory
    ADD CONSTRAINT material_inventory_plant_id_fkey FOREIGN KEY (plant_id) REFERENCES app.plants(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.material_inventory material_inventory_shelf_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.material_inventory
    ADD CONSTRAINT material_inventory_shelf_id_fkey FOREIGN KEY (shelf_id) REFERENCES app.storage_shelves(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.material_inventory material_inventory_storage_location_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.material_inventory
    ADD CONSTRAINT material_inventory_storage_location_id_fkey FOREIGN KEY (storage_location_id) REFERENCES app.storage_locations(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.material_kinds material_kinds_shape_code_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.material_kinds
    ADD CONSTRAINT material_kinds_shape_code_fkey FOREIGN KEY (shape_code) REFERENCES app.material_shapes(code) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.material_manufacturer_grades material_manufacturer_grades_manufacturer_code_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.material_manufacturer_grades
    ADD CONSTRAINT material_manufacturer_grades_manufacturer_code_fkey FOREIGN KEY (manufacturer_code) REFERENCES app.material_manufacturers(code) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.material_purchase_order_items material_purchase_order_items_material_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.material_purchase_order_items
    ADD CONSTRAINT material_purchase_order_items_material_id_fkey FOREIGN KEY (material_id) REFERENCES app.materials(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.material_purchase_order_items material_purchase_order_items_plant_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.material_purchase_order_items
    ADD CONSTRAINT material_purchase_order_items_plant_id_fkey FOREIGN KEY (plant_id) REFERENCES app.plants(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.material_purchase_order_items material_purchase_order_items_purchase_order_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.material_purchase_order_items
    ADD CONSTRAINT material_purchase_order_items_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES app.material_purchase_orders(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.material_purchase_orders material_purchase_orders_approved_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.material_purchase_orders
    ADD CONSTRAINT material_purchase_orders_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.material_purchase_orders material_purchase_orders_cancelled_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.material_purchase_orders
    ADD CONSTRAINT material_purchase_orders_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.material_purchase_orders material_purchase_orders_completed_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.material_purchase_orders
    ADD CONSTRAINT material_purchase_orders_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.material_purchase_orders material_purchase_orders_created_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.material_purchase_orders
    ADD CONSTRAINT material_purchase_orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.material_purchase_orders material_purchase_orders_ordered_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.material_purchase_orders
    ADD CONSTRAINT material_purchase_orders_ordered_by_fkey FOREIGN KEY (ordered_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.material_purchase_orders material_purchase_orders_requested_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.material_purchase_orders
    ADD CONSTRAINT material_purchase_orders_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.material_purchase_orders material_purchase_orders_supplier_bp_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.material_purchase_orders
    ADD CONSTRAINT material_purchase_orders_supplier_bp_id_fkey FOREIGN KEY (supplier_bp_id) REFERENCES app.business_partners(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.material_receipts material_receipts_created_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.material_receipts
    ADD CONSTRAINT material_receipts_created_by_fkey FOREIGN KEY (created_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.material_receipts material_receipts_material_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.material_receipts
    ADD CONSTRAINT material_receipts_material_id_fkey FOREIGN KEY (material_id) REFERENCES app.materials(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.material_receipts material_receipts_plant_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.material_receipts
    ADD CONSTRAINT material_receipts_plant_id_fkey FOREIGN KEY (plant_id) REFERENCES app.plants(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.material_receipts material_receipts_purchase_order_item_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.material_receipts
    ADD CONSTRAINT material_receipts_purchase_order_item_id_fkey FOREIGN KEY (purchase_order_item_id) REFERENCES app.material_purchase_order_items(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.material_receipts material_receipts_supplier_bp_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.material_receipts
    ADD CONSTRAINT material_receipts_supplier_bp_id_fkey FOREIGN KEY (supplier_bp_id) REFERENCES app.business_partners(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.material_type_prices material_type_prices_diameter_code_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.material_type_prices
    ADD CONSTRAINT material_type_prices_diameter_code_fkey FOREIGN KEY (diameter_code) REFERENCES app.material_diameters(code) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.material_type_prices material_type_prices_material_type_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.material_type_prices
    ADD CONSTRAINT material_type_prices_material_type_id_fkey FOREIGN KEY (material_type_id) REFERENCES app.material_types(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- app.material_type_prices material_type_prices_surface_finish_code_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.material_type_prices
    ADD CONSTRAINT material_type_prices_surface_finish_code_fkey FOREIGN KEY (surface_finish_code) REFERENCES app.material_surface_finishes(code) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.material_types material_types_manufacturer_code_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.material_types
    ADD CONSTRAINT material_types_manufacturer_code_fkey FOREIGN KEY (manufacturer_code) REFERENCES app.material_manufacturers(code) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.material_types material_types_manufacturer_code_grade_code_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.material_types
    ADD CONSTRAINT material_types_manufacturer_code_grade_code_fkey FOREIGN KEY (manufacturer_code, grade_code) REFERENCES app.material_manufacturer_grades(manufacturer_code, code) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.material_types material_types_shape_code_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.material_types
    ADD CONSTRAINT material_types_shape_code_fkey FOREIGN KEY (shape_code) REFERENCES app.material_shapes(code) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.materials materials_diameter_code_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.materials
    ADD CONSTRAINT materials_diameter_code_fkey FOREIGN KEY (diameter_code) REFERENCES app.material_diameters(code) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.materials materials_length_variant_code_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.materials
    ADD CONSTRAINT materials_length_variant_code_fkey FOREIGN KEY (length_variant_code) REFERENCES app.material_length_variants(code) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.materials materials_material_type_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.materials
    ADD CONSTRAINT materials_material_type_id_fkey FOREIGN KEY (material_type_id) REFERENCES app.material_types(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.materials materials_surface_finish_code_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.materials
    ADD CONSTRAINT materials_surface_finish_code_fkey FOREIGN KEY (surface_finish_code) REFERENCES app.material_surface_finishes(code) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.notifications notifications_user_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.order_acceptance_cancel_requests order_acceptance_cancel_requests_acceptance_year_month_acc_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.order_acceptance_cancel_requests
    ADD CONSTRAINT order_acceptance_cancel_requests_acceptance_year_month_acc_fkey FOREIGN KEY (acceptance_year_month, acceptance_seq) REFERENCES app.order_acceptances(year_month, seq) ON UPDATE CASCADE ON DELETE CASCADE;

-- app.order_acceptance_cancel_requests order_acceptance_cancel_requests_requested_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.order_acceptance_cancel_requests
    ADD CONSTRAINT order_acceptance_cancel_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.order_acceptance_cancel_requests order_acceptance_cancel_requests_resolved_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.order_acceptance_cancel_requests
    ADD CONSTRAINT order_acceptance_cancel_requests_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.order_acceptances order_acceptances_assigned_plant_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.order_acceptances
    ADD CONSTRAINT order_acceptances_assigned_plant_id_fkey FOREIGN KEY (assigned_plant_id) REFERENCES app.plants(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.order_acceptances order_acceptances_created_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.order_acceptances
    ADD CONSTRAINT order_acceptances_created_by_fkey FOREIGN KEY (created_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.order_acceptances order_acceptances_customer_bp_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.order_acceptances
    ADD CONSTRAINT order_acceptances_customer_bp_id_fkey FOREIGN KEY (customer_bp_id) REFERENCES app.business_partners(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.order_acceptances order_acceptances_customer_branch_bp_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.order_acceptances
    ADD CONSTRAINT order_acceptances_customer_branch_bp_id_fkey FOREIGN KEY (customer_branch_bp_id) REFERENCES app.business_partners(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.order_acceptances order_acceptances_end_user_bp_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.order_acceptances
    ADD CONSTRAINT order_acceptances_end_user_bp_id_fkey FOREIGN KEY (end_user_bp_id) REFERENCES app.business_partners(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.order_acceptances order_acceptances_sales_rep_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.order_acceptances
    ADD CONSTRAINT order_acceptances_sales_rep_id_fkey FOREIGN KEY (sales_rep_id) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.order_acceptances order_acceptances_ship_to_bp_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.order_acceptances
    ADD CONSTRAINT order_acceptances_ship_to_bp_id_fkey FOREIGN KEY (ship_to_bp_id) REFERENCES app.business_partners(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.order_acceptances order_acceptances_shipping_work_location_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.order_acceptances
    ADD CONSTRAINT order_acceptances_shipping_work_location_id_fkey FOREIGN KEY (shipping_work_location_id) REFERENCES app.work_locations(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.order_acceptances order_acceptances_source_file_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.order_acceptances
    ADD CONSTRAINT order_acceptances_source_file_id_fkey FOREIGN KEY (source_file_id) REFERENCES app.files(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.order_lines order_lines_acceptance_year_month_acceptance_seq_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.order_lines
    ADD CONSTRAINT order_lines_acceptance_year_month_acceptance_seq_fkey FOREIGN KEY (acceptance_year_month, acceptance_seq) REFERENCES app.order_acceptances(year_month, seq) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.order_lines order_lines_end_user_bp_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.order_lines
    ADD CONSTRAINT order_lines_end_user_bp_id_fkey FOREIGN KEY (end_user_bp_id) REFERENCES app.business_partners(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.order_lines order_lines_product_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.order_lines
    ADD CONSTRAINT order_lines_product_id_fkey FOREIGN KEY (product_id) REFERENCES app.products(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.plants plants_region_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.plants
    ADD CONSTRAINT plants_region_id_fkey FOREIGN KEY (region_id) REFERENCES app.regions(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.price_list_discounts price_list_discounts_variant_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.price_list_discounts
    ADD CONSTRAINT price_list_discounts_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES app.price_list_variants(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.price_list_entries price_list_entries_created_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.price_list_entries
    ADD CONSTRAINT price_list_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.price_list_entries price_list_entries_customer_bp_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.price_list_entries
    ADD CONSTRAINT price_list_entries_customer_bp_id_fkey FOREIGN KEY (customer_bp_id) REFERENCES app.business_partners(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.price_list_entries price_list_entries_product_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.price_list_entries
    ADD CONSTRAINT price_list_entries_product_id_fkey FOREIGN KEY (product_id) REFERENCES app.products(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.price_list_entries price_list_entries_sales_rep_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.price_list_entries
    ADD CONSTRAINT price_list_entries_sales_rep_id_fkey FOREIGN KEY (sales_rep_id) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.price_list_tiers price_list_tiers_variant_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.price_list_tiers
    ADD CONSTRAINT price_list_tiers_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES app.price_list_variants(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.price_list_variants price_list_variants_entry_year_month_entry_seq_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.price_list_variants
    ADD CONSTRAINT price_list_variants_entry_year_month_entry_seq_fkey FOREIGN KEY (entry_year_month, entry_seq) REFERENCES app.price_list_entries(year_month, seq) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.price_list_variants price_list_variants_estimate_year_month_estimate_seq_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.price_list_variants
    ADD CONSTRAINT price_list_variants_estimate_year_month_estimate_seq_fkey FOREIGN KEY (estimate_year_month, estimate_seq) REFERENCES app.estimates(year_month, seq) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.process_step_exec_dependencies process_step_exec_dependencies_depends_on_step_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.process_step_exec_dependencies
    ADD CONSTRAINT process_step_exec_dependencies_depends_on_step_id_fkey FOREIGN KEY (depends_on_step_id) REFERENCES app.process_step_catalog(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.process_step_exec_dependencies process_step_exec_dependencies_step_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.process_step_exec_dependencies
    ADD CONSTRAINT process_step_exec_dependencies_step_id_fkey FOREIGN KEY (step_id) REFERENCES app.process_step_catalog(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.process_step_use_dependencies process_step_use_dependencies_depends_on_step_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.process_step_use_dependencies
    ADD CONSTRAINT process_step_use_dependencies_depends_on_step_id_fkey FOREIGN KEY (depends_on_step_id) REFERENCES app.process_step_catalog(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.process_step_use_dependencies process_step_use_dependencies_step_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.process_step_use_dependencies
    ADD CONSTRAINT process_step_use_dependencies_step_id_fkey FOREIGN KEY (step_id) REFERENCES app.process_step_catalog(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.process_step_work_locations process_step_work_locations_process_step_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.process_step_work_locations
    ADD CONSTRAINT process_step_work_locations_process_step_id_fkey FOREIGN KEY (process_step_id) REFERENCES app.process_step_catalog(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- app.process_step_work_locations process_step_work_locations_work_location_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.process_step_work_locations
    ADD CONSTRAINT process_step_work_locations_work_location_id_fkey FOREIGN KEY (work_location_id) REFERENCES app.work_locations(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- app.product_inventory product_inventory_plant_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.product_inventory
    ADD CONSTRAINT product_inventory_plant_id_fkey FOREIGN KEY (plant_id) REFERENCES app.plants(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.product_inventory product_inventory_product_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.product_inventory
    ADD CONSTRAINT product_inventory_product_id_fkey FOREIGN KEY (product_id) REFERENCES app.products(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.product_inventory product_inventory_shelf_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.product_inventory
    ADD CONSTRAINT product_inventory_shelf_id_fkey FOREIGN KEY (shelf_id) REFERENCES app.storage_shelves(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.product_inventory product_inventory_storage_location_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.product_inventory
    ADD CONSTRAINT product_inventory_storage_location_id_fkey FOREIGN KEY (storage_location_id) REFERENCES app.storage_locations(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.product_process_route_version_steps product_process_route_version_steps_plant_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.product_process_route_version_steps
    ADD CONSTRAINT product_process_route_version_steps_plant_id_fkey FOREIGN KEY (plant_id) REFERENCES app.plants(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.product_process_route_version_steps product_process_route_version_steps_process_step_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.product_process_route_version_steps
    ADD CONSTRAINT product_process_route_version_steps_process_step_id_fkey FOREIGN KEY (process_step_id) REFERENCES app.process_step_catalog(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.product_process_route_version_steps product_process_route_version_steps_route_version_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.product_process_route_version_steps
    ADD CONSTRAINT product_process_route_version_steps_route_version_id_fkey FOREIGN KEY (route_version_id) REFERENCES app.product_process_route_versions(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- app.product_process_route_version_steps product_process_route_version_steps_supplier_bp_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.product_process_route_version_steps
    ADD CONSTRAINT product_process_route_version_steps_supplier_bp_id_fkey FOREIGN KEY (supplier_bp_id) REFERENCES app.business_partners(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.product_process_route_versions product_process_route_versions_created_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.product_process_route_versions
    ADD CONSTRAINT product_process_route_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.product_process_route_versions product_process_route_versions_route_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.product_process_route_versions
    ADD CONSTRAINT product_process_route_versions_route_id_fkey FOREIGN KEY (route_id) REFERENCES app.product_process_routes(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- app.product_process_routes product_process_routes_created_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.product_process_routes
    ADD CONSTRAINT product_process_routes_created_by_fkey FOREIGN KEY (created_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.product_process_routes product_process_routes_customer_bp_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.product_process_routes
    ADD CONSTRAINT product_process_routes_customer_bp_id_fkey FOREIGN KEY (customer_bp_id) REFERENCES app.business_partners(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.product_process_routes product_process_routes_product_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.product_process_routes
    ADD CONSTRAINT product_process_routes_product_id_fkey FOREIGN KEY (product_id) REFERENCES app.products(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.products products_material_type_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.products
    ADD CONSTRAINT products_material_type_id_fkey FOREIGN KEY (material_type_id) REFERENCES app.material_types(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.purchase_request_items purchase_request_items_material_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.purchase_request_items
    ADD CONSTRAINT purchase_request_items_material_id_fkey FOREIGN KEY (material_id) REFERENCES app.materials(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.purchase_request_items purchase_request_items_plant_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.purchase_request_items
    ADD CONSTRAINT purchase_request_items_plant_id_fkey FOREIGN KEY (plant_id) REFERENCES app.plants(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.purchase_request_items purchase_request_items_request_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.purchase_request_items
    ADD CONSTRAINT purchase_request_items_request_id_fkey FOREIGN KEY (request_id) REFERENCES app.purchase_requests(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.purchase_requests purchase_requests_approved_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.purchase_requests
    ADD CONSTRAINT purchase_requests_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.purchase_requests purchase_requests_cancelled_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.purchase_requests
    ADD CONSTRAINT purchase_requests_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.purchase_requests purchase_requests_created_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.purchase_requests
    ADD CONSTRAINT purchase_requests_created_by_fkey FOREIGN KEY (created_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.purchase_requests purchase_requests_ordered_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.purchase_requests
    ADD CONSTRAINT purchase_requests_ordered_by_fkey FOREIGN KEY (ordered_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.purchase_requests purchase_requests_purchase_order_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.purchase_requests
    ADD CONSTRAINT purchase_requests_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES app.material_purchase_orders(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.purchase_requests purchase_requests_requested_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.purchase_requests
    ADD CONSTRAINT purchase_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.push_subscriptions push_subscriptions_user_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.push_subscriptions
    ADD CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.quote_items quote_items_price_list_tier_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.quote_items
    ADD CONSTRAINT quote_items_price_list_tier_id_fkey FOREIGN KEY (price_list_tier_id) REFERENCES app.price_list_tiers(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.quote_items quote_items_product_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.quote_items
    ADD CONSTRAINT quote_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES app.products(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.quote_items quote_items_quote_year_month_quote_seq_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.quote_items
    ADD CONSTRAINT quote_items_quote_year_month_quote_seq_fkey FOREIGN KEY (quote_year_month, quote_seq) REFERENCES app.quotes(year_month, seq) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.quotes quotes_created_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.quotes
    ADD CONSTRAINT quotes_created_by_fkey FOREIGN KEY (created_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.quotes quotes_customer_bp_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.quotes
    ADD CONSTRAINT quotes_customer_bp_id_fkey FOREIGN KEY (customer_bp_id) REFERENCES app.business_partners(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.quotes quotes_customer_branch_bp_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.quotes
    ADD CONSTRAINT quotes_customer_branch_bp_id_fkey FOREIGN KEY (customer_branch_bp_id) REFERENCES app.business_partners(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.quotes quotes_pdf_file_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.quotes
    ADD CONSTRAINT quotes_pdf_file_id_fkey FOREIGN KEY (pdf_file_id) REFERENCES app.files(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.quotes quotes_sales_rep_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.quotes
    ADD CONSTRAINT quotes_sales_rep_id_fkey FOREIGN KEY (sales_rep_id) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.role_permission_relation role_permission_relation_permission_code_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.role_permission_relation
    ADD CONSTRAINT role_permission_relation_permission_code_fkey FOREIGN KEY (permission_code) REFERENCES app.permissions(code) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.role_permission_relation role_permission_relation_role_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.role_permission_relation
    ADD CONSTRAINT role_permission_relation_role_id_fkey FOREIGN KEY (role_id) REFERENCES app.roles(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.storage_locations storage_locations_floor_map_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.storage_locations
    ADD CONSTRAINT storage_locations_floor_map_id_fkey FOREIGN KEY (floor_map_id) REFERENCES app.kiosk_floor_maps(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.storage_locations storage_locations_plant_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.storage_locations
    ADD CONSTRAINT storage_locations_plant_id_fkey FOREIGN KEY (plant_id) REFERENCES app.plants(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.storage_shelves storage_shelves_location_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.storage_shelves
    ADD CONSTRAINT storage_shelves_location_id_fkey FOREIGN KEY (location_id) REFERENCES app.storage_locations(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.system_settings system_settings_updated_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.system_settings
    ADD CONSTRAINT system_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.user_home_settings user_home_settings_user_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.user_home_settings
    ADD CONSTRAINT user_home_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.user_notification_settings user_notification_settings_user_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.user_notification_settings
    ADD CONSTRAINT user_notification_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.user_plants user_plants_assigned_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.user_plants
    ADD CONSTRAINT user_plants_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.user_plants user_plants_plant_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.user_plants
    ADD CONSTRAINT user_plants_plant_id_fkey FOREIGN KEY (plant_id) REFERENCES app.plants(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.user_plants user_plants_user_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.user_plants
    ADD CONSTRAINT user_plants_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- app.user_role_relation user_role_relation_assigned_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.user_role_relation
    ADD CONSTRAINT user_role_relation_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.user_role_relation user_role_relation_role_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.user_role_relation
    ADD CONSTRAINT user_role_relation_role_id_fkey FOREIGN KEY (role_id) REFERENCES app.roles(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.user_role_relation user_role_relation_user_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.user_role_relation
    ADD CONSTRAINT user_role_relation_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.users users_avatar_file_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.users
    ADD CONSTRAINT users_avatar_file_id_fkey FOREIGN KEY (avatar_file_id) REFERENCES app.files(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.users users_avatar_thumb_file_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.users
    ADD CONSTRAINT users_avatar_thumb_file_id_fkey FOREIGN KEY (avatar_thumb_file_id) REFERENCES app.files(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.users users_employee_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.users
    ADD CONSTRAINT users_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES directory.employee_directory(ldap_guid) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.work_location_groups work_location_groups_plant_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.work_location_groups
    ADD CONSTRAINT work_location_groups_plant_id_fkey FOREIGN KEY (plant_id) REFERENCES app.plants(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.work_locations work_locations_group_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.work_locations
    ADD CONSTRAINT work_locations_group_id_fkey FOREIGN KEY (group_id) REFERENCES app.work_location_groups(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- app.work_order_flow_changes work_order_flow_changes_acknowledged_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.work_order_flow_changes
    ADD CONSTRAINT work_order_flow_changes_acknowledged_by_fkey FOREIGN KEY (acknowledged_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.work_order_flow_changes work_order_flow_changes_requested_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.work_order_flow_changes
    ADD CONSTRAINT work_order_flow_changes_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.work_order_flow_changes work_order_flow_changes_resolved_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.work_order_flow_changes
    ADD CONSTRAINT work_order_flow_changes_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.work_order_flow_changes work_order_flow_changes_work_order_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.work_order_flow_changes
    ADD CONSTRAINT work_order_flow_changes_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES app.work_orders(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- app.work_order_links work_order_links_created_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.work_order_links
    ADD CONSTRAINT work_order_links_created_by_fkey FOREIGN KEY (created_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.work_order_links work_order_links_source_work_order_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.work_order_links
    ADD CONSTRAINT work_order_links_source_work_order_id_fkey FOREIGN KEY (source_work_order_id) REFERENCES app.work_orders(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- app.work_order_links work_order_links_target_work_order_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.work_order_links
    ADD CONSTRAINT work_order_links_target_work_order_id_fkey FOREIGN KEY (target_work_order_id) REFERENCES app.work_orders(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- app.work_order_order_lines work_order_order_lines_order_line_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.work_order_order_lines
    ADD CONSTRAINT work_order_order_lines_order_line_id_fkey FOREIGN KEY (order_line_id) REFERENCES app.order_lines(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.work_order_order_lines work_order_order_lines_work_order_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.work_order_order_lines
    ADD CONSTRAINT work_order_order_lines_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES app.work_orders(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- app.work_order_step_actuals work_order_step_actuals_created_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.work_order_step_actuals
    ADD CONSTRAINT work_order_step_actuals_created_by_fkey FOREIGN KEY (created_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.work_order_step_actuals work_order_step_actuals_user_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.work_order_step_actuals
    ADD CONSTRAINT work_order_step_actuals_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.work_order_step_actuals work_order_step_actuals_work_location_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.work_order_step_actuals
    ADD CONSTRAINT work_order_step_actuals_work_location_id_fkey FOREIGN KEY (work_location_id) REFERENCES app.work_locations(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.work_order_step_actuals work_order_step_actuals_work_order_step_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.work_order_step_actuals
    ADD CONSTRAINT work_order_step_actuals_work_order_step_id_fkey FOREIGN KEY (work_order_step_id) REFERENCES app.work_order_steps(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- app.work_order_step_inspection_templates work_order_step_inspection_templates_inspection_template_i_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.work_order_step_inspection_templates
    ADD CONSTRAINT work_order_step_inspection_templates_inspection_template_i_fkey FOREIGN KEY (inspection_template_id) REFERENCES app.inspection_templates(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.work_order_step_inspection_templates work_order_step_inspection_templates_work_order_step_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.work_order_step_inspection_templates
    ADD CONSTRAINT work_order_step_inspection_templates_work_order_step_id_fkey FOREIGN KEY (work_order_step_id) REFERENCES app.work_order_steps(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- app.work_order_step_links work_order_step_links_source_step_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.work_order_step_links
    ADD CONSTRAINT work_order_step_links_source_step_id_fkey FOREIGN KEY (source_step_id) REFERENCES app.work_order_steps(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- app.work_order_step_links work_order_step_links_target_step_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.work_order_step_links
    ADD CONSTRAINT work_order_step_links_target_step_id_fkey FOREIGN KEY (target_step_id) REFERENCES app.work_order_steps(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- app.work_order_step_links work_order_step_links_work_order_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.work_order_step_links
    ADD CONSTRAINT work_order_step_links_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES app.work_orders(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- app.work_order_step_plans work_order_step_plans_created_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.work_order_step_plans
    ADD CONSTRAINT work_order_step_plans_created_by_fkey FOREIGN KEY (created_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.work_order_step_plans work_order_step_plans_user_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.work_order_step_plans
    ADD CONSTRAINT work_order_step_plans_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.work_order_step_plans work_order_step_plans_work_location_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.work_order_step_plans
    ADD CONSTRAINT work_order_step_plans_work_location_id_fkey FOREIGN KEY (work_location_id) REFERENCES app.work_locations(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.work_order_step_plans work_order_step_plans_work_order_step_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.work_order_step_plans
    ADD CONSTRAINT work_order_step_plans_work_order_step_id_fkey FOREIGN KEY (work_order_step_id) REFERENCES app.work_order_steps(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- app.work_order_steps work_order_steps_plant_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.work_order_steps
    ADD CONSTRAINT work_order_steps_plant_id_fkey FOREIGN KEY (plant_id) REFERENCES app.plants(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.work_order_steps work_order_steps_process_step_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.work_order_steps
    ADD CONSTRAINT work_order_steps_process_step_id_fkey FOREIGN KEY (process_step_id) REFERENCES app.process_step_catalog(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.work_order_steps work_order_steps_supplier_bp_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.work_order_steps
    ADD CONSTRAINT work_order_steps_supplier_bp_id_fkey FOREIGN KEY (supplier_bp_id) REFERENCES app.business_partners(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.work_order_steps work_order_steps_work_order_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.work_order_steps
    ADD CONSTRAINT work_order_steps_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES app.work_orders(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- app.work_orders work_orders_created_by_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.work_orders
    ADD CONSTRAINT work_orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES app.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.work_orders work_orders_material_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.work_orders
    ADD CONSTRAINT work_orders_material_id_fkey FOREIGN KEY (material_id) REFERENCES app.materials(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.work_orders work_orders_product_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.work_orders
    ADD CONSTRAINT work_orders_product_id_fkey FOREIGN KEY (product_id) REFERENCES app.products(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- app.work_orders work_orders_route_version_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.work_orders
    ADD CONSTRAINT work_orders_route_version_id_fkey FOREIGN KEY (route_version_id) REFERENCES app.product_process_route_versions(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.work_orders work_orders_source_work_order_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.work_orders
    ADD CONSTRAINT work_orders_source_work_order_id_fkey FOREIGN KEY (source_work_order_id) REFERENCES app.work_orders(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- app.work_orders work_orders_storage_location_id_fkey (FK CONSTRAINT)
ALTER TABLE ONLY app.work_orders
    ADD CONSTRAINT work_orders_storage_location_id_fkey FOREIGN KEY (storage_location_id) REFERENCES app.storage_locations(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- PostgreSQL database dump complete
--
