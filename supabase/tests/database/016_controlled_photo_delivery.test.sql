begin;
select plan(4);
select has_function('api','catalog_photos',array[]::text[],'catalog photo read model exists');
select has_function('api','catalog_photo_object',array['uuid'],'controlled photo lookup exists');

insert into public.item_photos(id,catalog_item_id,object_name,caption,processing_state,width,height,uploaded_by)
values('00000000-0000-0000-0000-000000000940','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000101/00000000-0000-0000-0000-000000000998.webp','Arduino board on workbench','ready',320,200,'00000000-0000-0000-0000-000000000005');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select results_eq($$select photo_id from api.catalog_photos()$$,$$values ('00000000-0000-0000-0000-000000000940'::uuid)$$,'active signed-in non-member can resolve ready catalog photos');

reset role;
update public.profiles set active=false where id='00000000-0000-0000-0000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select is_empty($$select object_name from api.catalog_photo_object('00000000-0000-0000-0000-000000000940')$$,'deactivated account cannot resolve private photo objects');

select * from finish();
rollback;
