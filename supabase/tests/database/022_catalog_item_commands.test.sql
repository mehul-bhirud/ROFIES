begin;
select plan(38);

select has_function('api','create_catalog_item',array['uuid','text','text','text','text','text','integer','integer','integer','integer','boolean','boolean','integer','date','text','date','numeric','jsonb','jsonb','text'],'catalog item create command exists');
select has_function('api','update_catalog_item',array['uuid','uuid','text','text','text','text','integer','integer','integer','integer','boolean','boolean','integer','date','text','date','numeric','jsonb','text','text'],'catalog item update command exists');
select has_function('api','archive_catalog_item',array['uuid','text','text'],'catalog item archive command exists');
select has_function('api','restore_catalog_item',array['uuid','text','text'],'catalog item restore command exists');
select has_function('api','delete_catalog_item',array['uuid','text','text'],'catalog item delete command exists');
select has_function('api','adjust_stock',array['uuid','uuid','text','integer','text','text'],'stock adjustment command exists');
select has_function('api','add_individual_asset',array['uuid','text','uuid','text','text','text'],'individual asset add command exists');
select has_function('api','catalog_item_detail',array['uuid'],'catalog item detail read command exists');
select has_function('api','inventory_list','staff inventory listing command exists');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select throws_ok(
  $$select api.create_catalog_item('00000000-0000-0000-0000-000000000201','Unauthorized Item',null,'pooled_reusable',null,null,null,null,null,null,true,false,null,null,null,null,null,'[]'::jsonb,'[]'::jsonb,'create-test-unauth-0001')$$,
  '42501',null,'members without inventory:manage cannot create catalog items'
);

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',true);

select lives_ok(
  $$select api.create_catalog_item(
    '00000000-0000-0000-0000-000000000201','Plan Test Pooled Item','A pooled test fixture','pooled_reusable',
    'Public remarks','Internal remarks',7,21,3,24,true,false,2,null,null,null,null,
    '["fixture","pooled"]'::jsonb,
    '[{"storage_location_id":"00000000-0000-0000-0000-000000000301","condition":"perfect","quantity":5}]'::jsonb,
    'create-test-0001'
  )$$,
  'inventory manager can create a pooled catalog item with opening stock'
);
select results_eq(
  $$select tracking_mode::text from public.catalog_items where name='Plan Test Pooled Item'$$,
  $$values ('pooled_reusable'::text)$$,
  'the created item has the requested tracking mode'
);
select results_eq(
  $$select quantity_on_hand from public.pool_balances where catalog_item_id=(select id from public.catalog_items where name='Plan Test Pooled Item') and storage_location_id='00000000-0000-0000-0000-000000000301' and condition='perfect'$$,
  $$values (5)$$,
  'the opening stock created the expected pool balance'
);
select results_eq(
  $$select count(*)::bigint from public.stock_adjustments where catalog_item_id=(select id from public.catalog_items where name='Plan Test Pooled Item')$$,
  $$values (1::bigint)$$,
  'the opening stock recorded one acquisition adjustment'
);
select lives_ok(
  $$select api.create_catalog_item('00000000-0000-0000-0000-000000000201','Plan Test Pooled Item','A pooled test fixture','pooled_reusable','Public remarks','Internal remarks',7,21,3,24,true,false,2,null,null,null,null,'["fixture","pooled"]'::jsonb,'[{"storage_location_id":"00000000-0000-0000-0000-000000000301","condition":"perfect","quantity":5}]'::jsonb,'create-test-0001')$$,
  'replaying the same idempotency key does not error'
);
select results_eq(
  $$select count(*)::bigint from public.catalog_items where name='Plan Test Pooled Item'$$,
  $$values (1::bigint)$$,
  'replaying the same idempotency key did not create a duplicate item'
);
select throws_ok(
  $$select api.create_catalog_item('00000000-0000-0000-0000-000000000201','Bad Loan Days',null,'pooled_reusable',null,null,10,5,null,null,true,false,null,null,null,null,null,'[]'::jsonb,'[]'::jsonb,'create-test-baddays-0001')$$,
  'P0001',null,'maximum loan days below default loan days is rejected'
);

select lives_ok(
  $$select api.update_catalog_item(
    (select id from public.catalog_items where name='Plan Test Pooled Item'),
    '00000000-0000-0000-0000-000000000201','Plan Test Pooled Item Renamed','Updated description',
    'Updated public remarks','Updated internal remarks',7,21,3,24,true,false,2,null,null,null,null,
    '["fixture","pooled","renamed"]'::jsonb,'Renamed during test','update-test-0001'
  )$$,
  'inventory manager can update catalog item metadata'
);
select results_eq(
  $$select name from public.catalog_items where name='Plan Test Pooled Item Renamed'$$,
  $$values ('Plan Test Pooled Item Renamed'::text)$$,
  'catalog item name reflects the update'
);

select lives_ok(
  $$select api.archive_catalog_item((select id from public.catalog_items where name='Plan Test Pooled Item Renamed'),'Retiring test fixture','archive-test-0001')$$,
  'inventory manager can archive a catalog item'
);
select results_eq(
  $$select archived_at is not null from public.catalog_items where name='Plan Test Pooled Item Renamed'$$,
  $$values (true)$$,
  'archived item has archived_at set'
);
select results_eq(
  $$select archived_at is not null from api.inventory_list() where name='Plan Test Pooled Item Renamed'$$,
  $$values (true)$$,
  'the staff inventory list includes archived items'
);
select throws_ok(
  $$select api.archive_catalog_item((select id from public.catalog_items where name='Plan Test Pooled Item Renamed'),'Retry','archive-test-0002')$$,
  'P0001',null,'archiving an already-archived item is rejected'
);
select lives_ok(
  $$select api.restore_catalog_item((select id from public.catalog_items where name='Plan Test Pooled Item Renamed'),'Bringing fixture back','restore-test-0001')$$,
  'inventory manager can restore an archived catalog item'
);
select results_eq(
  $$select archived_at is null from public.catalog_items where name='Plan Test Pooled Item Renamed'$$,
  $$values (true)$$,
  'restored item no longer has archived_at set'
);

select lives_ok(
  $$select api.adjust_stock((select id from public.catalog_items where name='Plan Test Pooled Item Renamed'),'00000000-0000-0000-0000-000000000301','perfect',3,'Extra units received','adjust-test-0001')$$,
  'inventory manager can add stock to a pooled item'
);
select results_eq(
  $$select quantity_on_hand from public.pool_balances where catalog_item_id=(select id from public.catalog_items where name='Plan Test Pooled Item Renamed') and storage_location_id='00000000-0000-0000-0000-000000000301' and condition='perfect'$$,
  $$values (8)$$,
  'stock quantity reflects the opening balance plus the adjustment'
);
select throws_ok(
  $$select api.adjust_stock((select id from public.catalog_items where name='Plan Test Pooled Item Renamed'),'00000000-0000-0000-0000-000000000301','perfect',-100,'Too many removed','adjust-test-0002')$$,
  'P0001',null,'a correction that would go negative is rejected'
);
select throws_ok(
  $$select api.adjust_stock('00000000-0000-0000-0000-000000000103','00000000-0000-0000-0000-000000000301','perfect',1,'Should be rejected','adjust-test-0003')$$,
  'P0001',null,'stock adjustments are rejected for individual-asset items'
);

select lives_ok(
  $$select api.add_individual_asset('00000000-0000-0000-0000-000000000103','RN-JET-02','00000000-0000-0000-0000-000000000301','perfect','Second unit acquired','asset-test-0001')$$,
  'inventory manager can add a unit to an individual-asset item'
);
select results_eq(
  $$select count(*)::bigint from public.individual_assets where catalog_item_id='00000000-0000-0000-0000-000000000103'$$,
  $$values (2::bigint)$$,
  'the individual-asset item now has two units on record'
);

select throws_ok(
  $$select api.delete_catalog_item('00000000-0000-0000-0000-000000000101','Attempting to delete a used item','delete-test-0001')$$,
  'P0001',null,'an item with request history cannot be permanently deleted'
);
select throws_ok(
  $$select api.delete_catalog_item((select id from public.catalog_items where name='Plan Test Pooled Item Renamed'),'Attempting to delete a stocked item','delete-test-0002')$$,
  'P0001',null,'an item with stock adjustment history cannot be permanently deleted'
);
select lives_ok(
  $$select api.create_catalog_item('00000000-0000-0000-0000-000000000204','Plan Test Empty Draft',null,'consumable',null,null,null,null,null,null,true,false,null,null,null,null,null,'[]'::jsonb,'[]'::jsonb,'create-test-draft-0001')$$,
  'inventory manager can create a draft item with no opening stock'
);
select lives_ok(
  $$select api.delete_catalog_item((select id from public.catalog_items where name='Plan Test Empty Draft'),'Removing unused draft','delete-test-0003')$$,
  'an unused draft item can be permanently deleted'
);
select results_eq(
  $$select count(*)::bigint from public.catalog_items where name='Plan Test Empty Draft'$$,
  $$values (0::bigint)$$,
  'the deleted draft no longer exists'
);

select results_eq(
  $$select (api.catalog_item_detail((select id from public.catalog_items where name='Plan Test Pooled Item Renamed'))->>'name')$$,
  $$values ('Plan Test Pooled Item Renamed'::text)$$,
  'catalog_item_detail returns the current name'
);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select throws_ok(
  $$select api.catalog_item_detail('00000000-0000-0000-0000-000000000101')$$,
  '42501',null,'members without inventory:manage cannot read catalog item detail'
);

select * from finish();
rollback;
