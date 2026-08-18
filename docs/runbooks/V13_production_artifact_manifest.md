# V13 Production Artifact Manifest & Verification State

## 1. Artifact Metadata
- **Migration Script**: `supabase/update_v13_order_lifecycle_canonicalization.sql`
- **SHA256 Checksum**: `03DAA2ECB14932C36E6B62E0CBFFA4669F911A0CE99B686FDAF4C252755CDCC0`
- **File Size**: `8,767 bytes`
- **Total Lines**: `243 lines`
- **Required Predecessor**: `supabase/update_v12_commercial_sot_hardening.sql` (V12)
- **Target Schema Version**: V13
- **Status**: `READY_FOR_STAGING_REVIEW` (Local PostgreSQL 18 Fully Verified; Production Mutation = NONE)

---

## 2. Preflight Dirty Data Checks Included
The migration file includes deterministic, fail-closed preflight blocks:
1. `V13_ACTIVE_ORDER_DUPLICATES_FOUND`: Fails if any organization has more than 1 active customer order.
2. `V13_ACCEPTED_QUOTE_DUPLICATES_FOUND`: Fails if any order has more than 1 accepted quote version.

---

## 3. Database Objects Created / Modified
1. **New Columns**:
   - `customer_orders.customer_tax_code` (TEXT)
   - `customer_orders.customer_note` (TEXT)
   - `order_items.variant_image` (TEXT)
   - `quote_versions.accepted_at` (TIMESTAMPTZ)
2. **New Tables**:
   - `order_revision_history` with `UNIQUE(order_id, revision_no)`
   - `order_sync_revisions` with `PRIMARY KEY(scope_type, scope_id)`
3. **New Indexes**:
   - `uq_customer_orders_active_org` ON `customer_orders(organization_id)` WHERE `commercial_status NOT IN ('cancelled') AND fulfillment_status NOT IN ('delivered')`
   - `uq_quote_versions_single_accepted` ON `quote_versions(order_id)` WHERE `status = 'accepted'`
4. **Security Functions & Triggers**:
   - `pt_guard_accepted_quote_immutability()` & `trg_guard_accepted_quote_immutability`
   - `pt_guard_accepted_adjustment_immutability()` & `trg_guard_accepted_adjustment_immutability`
   - `pt_guard_locked_order_item_immutability()` & `trg_guard_locked_order_item_immutability`
