-- Fictional local/test data only. No real student, staff, supplier, or credential data.
insert into public.institution_domains (domain) values ('iiitp.ac.in')
on conflict (domain) do update set active=true, updated_at=now();

insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
values
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000001','authenticated','authenticated','anaya.kulkarni@iiitp.ac.in','',now(),'{"provider":"email","providers":["email"]}','{"full_name":"Anaya Kulkarni"}',now(),now(),'','','',''),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000002','authenticated','authenticated','kabir.shah@iiitp.ac.in','',now(),'{"provider":"email","providers":["email"]}','{"full_name":"Kabir Shah"}',now(),now(),'','','',''),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000003','authenticated','authenticated','rhea.nair@iiitp.ac.in','',now(),'{"provider":"email","providers":["email"]}','{"full_name":"Rhea Nair"}',now(),now(),'','','',''),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000004','authenticated','authenticated','vivaan.iyer@iiitp.ac.in','',now(),'{"provider":"email","providers":["email"]}','{"full_name":"Vivaan Iyer"}',now(),now(),'','','',''),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000005','authenticated','authenticated','meera.joshi@iiitp.ac.in','',now(),'{"provider":"email","providers":["email"]}','{"full_name":"Meera Joshi"}',now(),now(),'','','',''),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000006','authenticated','authenticated','arjun.desai@iiitp.ac.in','',now(),'{"provider":"email","providers":["email"]}','{"full_name":"Arjun Desai"}',now(),now(),'','','',''),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000007','authenticated','authenticated','tara.singh@iiitp.ac.in','',now(),'{"provider":"email","providers":["email"]}','{"full_name":"Tara Singh"}',now(),now(),'','','','')
on conflict (id) do nothing;

insert into public.profiles (id,institutional_email,display_name,student_identifier,department,study_year,phone,active,last_authenticated_at) values
('00000000-0000-0000-0000-000000000001','anaya.kulkarni@iiitp.ac.in','Anaya Kulkarni','FIC-2401','ECE',3,'+91 90000 00001',true,now()),
('00000000-0000-0000-0000-000000000002','kabir.shah@iiitp.ac.in','Kabir Shah','FIC-2402','CSE',2,null,true,now()),
('00000000-0000-0000-0000-000000000003','rhea.nair@iiitp.ac.in','Rhea Nair','FIC-2403','CSE',1,null,true,now()),
('00000000-0000-0000-0000-000000000004','vivaan.iyer@iiitp.ac.in','Vivaan Iyer','FIC-2204','ECE',4,null,true,now()),
('00000000-0000-0000-0000-000000000005','meera.joshi@iiitp.ac.in','Meera Joshi','FIC-2205','ECE',4,'+91 90000 00005',true,now()),
('00000000-0000-0000-0000-000000000006','arjun.desai@iiitp.ac.in','Arjun Desai','FIC-2206','CSE',4,null,true,now()),
('00000000-0000-0000-0000-000000000007','tara.singh@iiitp.ac.in','Tara Singh','FIC-2307','ECE',3,null,true,now());

insert into public.memberships (profile_id,status,approved_by,approved_at,reason) values
('00000000-0000-0000-0000-000000000001','active','00000000-0000-0000-0000-000000000006',now()-interval '1 year','Approved fictional member'),
('00000000-0000-0000-0000-000000000002','active','00000000-0000-0000-0000-000000000006',now()-interval '8 months','Approved fictional member'),
('00000000-0000-0000-0000-000000000003','inactive',null,null,'Awaiting orientation'),
('00000000-0000-0000-0000-000000000004','active','00000000-0000-0000-0000-000000000006',now()-interval '2 years','Staff member'),
('00000000-0000-0000-0000-000000000005','active','00000000-0000-0000-0000-000000000006',now()-interval '2 years','Staff member'),
('00000000-0000-0000-0000-000000000006','active','00000000-0000-0000-0000-000000000006',now()-interval '2 years','Administrator'),
('00000000-0000-0000-0000-000000000007','suspended','00000000-0000-0000-0000-000000000006',now()-interval '1 year','Orientation renewal required');

insert into public.member_applications (
  id,profile_id,state,submitted_at,reviewed_at,decided_at,decided_by,decision_reason,created_at,updated_at
) values
('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000001','approved',now()-interval '1 year',now()-interval '1 year',now()-interval '1 year','00000000-0000-0000-0000-000000000006','Approved fictional member',now()-interval '1 year',now()-interval '1 year'),
('00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000002','approved',now()-interval '8 months',now()-interval '8 months',now()-interval '8 months','00000000-0000-0000-0000-000000000006','Approved fictional member',now()-interval '8 months',now()-interval '8 months'),
('00000000-0000-0000-0000-000000000104','00000000-0000-0000-0000-000000000004','approved',now()-interval '2 years',now()-interval '2 years',now()-interval '2 years','00000000-0000-0000-0000-000000000006','Staff member',now()-interval '2 years',now()-interval '2 years'),
('00000000-0000-0000-0000-000000000105','00000000-0000-0000-0000-000000000005','approved',now()-interval '2 years',now()-interval '2 years',now()-interval '2 years','00000000-0000-0000-0000-000000000006','Staff member',now()-interval '2 years',now()-interval '2 years'),
('00000000-0000-0000-0000-000000000106','00000000-0000-0000-0000-000000000006','approved',now()-interval '2 years',now()-interval '2 years',now()-interval '2 years','00000000-0000-0000-0000-000000000006','Administrator',now()-interval '2 years',now()-interval '2 years');

insert into public.role_assignments (profile_id,capability,granted_by) values
('00000000-0000-0000-0000-000000000004','request:approve','00000000-0000-0000-0000-000000000006'),
('00000000-0000-0000-0000-000000000005','inventory:manage','00000000-0000-0000-0000-000000000006'),
('00000000-0000-0000-0000-000000000005','circulation:handover','00000000-0000-0000-0000-000000000006'),
('00000000-0000-0000-0000-000000000005','circulation:return','00000000-0000-0000-0000-000000000006'),
('00000000-0000-0000-0000-000000000006','membership:manage','00000000-0000-0000-0000-000000000006'),
('00000000-0000-0000-0000-000000000006','roles:manage','00000000-0000-0000-0000-000000000006'),
('00000000-0000-0000-0000-000000000006','audit:read','00000000-0000-0000-0000-000000000006'),
('00000000-0000-0000-0000-000000000006','reports:export','00000000-0000-0000-0000-000000000006'),
('00000000-0000-0000-0000-000000000006','system:manage','00000000-0000-0000-0000-000000000006');

insert into public.categories (id,name,description,default_loan_days,default_pickup_hours) values
('00000000-0000-0000-0000-000000000201','Controllers','Development boards and embedded controllers',7,24),
('00000000-0000-0000-0000-000000000202','Actuation','Motors, servos, and drive components',5,24),
('00000000-0000-0000-0000-000000000203','Fabrication','Tools used to assemble and fabricate robots',3,12),
('00000000-0000-0000-0000-000000000204','Components','Low-value electronic consumables',1,8);

insert into public.storage_locations (id,room,cabinet,shelf,bin) values
('00000000-0000-0000-0000-000000000301','Robotics Lab','Blue cabinet','Shelf B','Bin 4'),
('00000000-0000-0000-0000-000000000302','Robotics Lab','Tool wall','Bay 2',null),
('00000000-0000-0000-0000-000000000303','Electronics Lab','ESD cabinet','Drawer 3','C-12');

insert into public.catalog_items (id,category_id,name,description,tracking_mode,return_required,public_remarks,internal_remarks,default_loan_days,maximum_loan_days,member_quantity_limit,pickup_window_hours,waitlist_enabled,counter_issue_enabled,low_stock_threshold,created_by) values
('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201','Arduino Mega 2560','ATmega2560 development board for high I/O prototypes.','pooled_reusable',true,'USB cable is issued separately.','Keep original boards in ESD sleeves.',7,21,3,24,true,false,3,'00000000-0000-0000-0000-000000000005'),
('00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000202','Dynamixel XL430-W250','Smart serial actuator for mobile robots and manipulators.','pooled_reusable',true,'Use the approved power hub.','Inspect horns after every return.',5,14,6,24,true,false,2,'00000000-0000-0000-0000-000000000005'),
('00000000-0000-0000-0000-000000000103','00000000-0000-0000-0000-000000000201','Jetson Orin Nano Kit','Edge AI development kit with power supply and carrier board.','individual_asset',true,'A short checkout briefing is required.','High-value item; verify serial at handover.',4,10,1,12,true,false,1,'00000000-0000-0000-0000-000000000005'),
('00000000-0000-0000-0000-000000000104','00000000-0000-0000-0000-000000000203','Lead-free Soldering Station','Temperature-controlled bench soldering station.','individual_asset',true,'Use only in supervised project spaces.','Tip set stored separately.',2,5,1,8,true,false,1,'00000000-0000-0000-0000-000000000005'),
('00000000-0000-0000-0000-000000000105','00000000-0000-0000-0000-000000000204','M3 Fastener Kit','Assorted M3 screws, nuts, and spacers for prototypes.','consumable',false,'Quantities are issued by packet.','Repack weekly.',null,null,4,8,false,true,10,'00000000-0000-0000-0000-000000000005'),
('00000000-0000-0000-0000-000000000106','00000000-0000-0000-0000-000000000202','NEMA 17 Stepper Motor','Bipolar 42 mm stepper motor for positioning systems.','pooled_reusable',true,'Driver is not included.','Two units have short leads.',5,14,4,24,true,false,2,'00000000-0000-0000-0000-000000000005'),
('00000000-0000-0000-0000-000000000107','00000000-0000-0000-0000-000000000204','Prototype Jumper Wire Set','Male/female jumper leads in a set of forty.','consumable',false,'Choose the connector mix at the counter.','Count by sealed set.',null,null,3,8,false,true,8,'00000000-0000-0000-0000-000000000005'),
('00000000-0000-0000-0000-000000000108','00000000-0000-0000-0000-000000000203','USB Logic Analyzer','Eight-channel analyzer for digital bus debugging.','pooled_reusable',true,'Test clips are included.','One unit routed to repair.',3,10,2,12,true,false,2,'00000000-0000-0000-0000-000000000005');

insert into public.catalog_aliases (catalog_item_id,alias) values
('00000000-0000-0000-0000-000000000101','Mega'),('00000000-0000-0000-0000-000000000103','Orin Nano'),('00000000-0000-0000-0000-000000000108','Logic probe');
insert into public.catalog_tags (catalog_item_id,tag) values
('00000000-0000-0000-0000-000000000101','embedded'),('00000000-0000-0000-0000-000000000101','5V'),('00000000-0000-0000-0000-000000000103','AI'),('00000000-0000-0000-0000-000000000106','motion');
insert into public.catalog_specifications (catalog_item_id,key,value) values
('00000000-0000-0000-0000-000000000101','Logic voltage','5 V'),('00000000-0000-0000-0000-000000000102','Protocol','TTL serial'),('00000000-0000-0000-0000-000000000103','Memory','8 GB'),('00000000-0000-0000-0000-000000000106','Step angle','1.8°');

insert into public.pool_balances (catalog_item_id,storage_location_id,condition,quantity_on_hand) values
('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000301','perfect',8),
('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000301','minor_damage',2),
('00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000301','perfect',8),
('00000000-0000-0000-0000-000000000105','00000000-0000-0000-0000-000000000303','perfect',38),
('00000000-0000-0000-0000-000000000106','00000000-0000-0000-0000-000000000301','perfect',6),
('00000000-0000-0000-0000-000000000107','00000000-0000-0000-0000-000000000303','perfect',24),
('00000000-0000-0000-0000-000000000108','00000000-0000-0000-0000-000000000303','perfect',3),
('00000000-0000-0000-0000-000000000108','00000000-0000-0000-0000-000000000303','repair_required',1);

insert into public.individual_assets (id,catalog_item_id,local_identifier,condition,custody_state,storage_location_id,internal_remarks) values
('00000000-0000-0000-0000-000000000111','00000000-0000-0000-0000-000000000103','RN-JET-01','perfect','on_hand','00000000-0000-0000-0000-000000000301','Carrier board checked'),
('00000000-0000-0000-0000-000000000112','00000000-0000-0000-0000-000000000104','RN-SOL-02','minor_damage','on_hand','00000000-0000-0000-0000-000000000302','Cosmetic mark on stand');

insert into public.requests (id,borrower_id,status,purpose,project_name,requested_start,requested_end,submitted_at) values
('00000000-0000-0000-0000-000000000401','00000000-0000-0000-0000-000000000001','under_review','Line-following robot control prototype','Autonomy Sprint',now()+interval '3 days',now()+interval '8 days',now()-interval '2 hours'),
('00000000-0000-0000-0000-000000000402','00000000-0000-0000-0000-000000000002','submitted','Stepper characterization fixture','Motion Bench',now()+interval '5 days',now()+interval '10 days',now()-interval '35 minutes');
insert into public.request_lines (id,request_id,catalog_item_id,requested_quantity,member_remarks) values
('00000000-0000-0000-0000-000000000411','00000000-0000-0000-0000-000000000401','00000000-0000-0000-0000-000000000101',2,'Need two boards for parallel integration'),
('00000000-0000-0000-0000-000000000412','00000000-0000-0000-0000-000000000402','00000000-0000-0000-0000-000000000106',2,'Matched pair preferred');

insert into public.requests (id,borrower_id,status,purpose,project_name,requested_start,requested_end,submitted_at) values
('00000000-0000-0000-0000-000000000403','00000000-0000-0000-0000-000000000001','approved','Autonomy Sprint pickup','Autonomy Sprint',now()-interval '1 hour',now()+interval '6 days',now()-interval '1 day'),
('00000000-0000-0000-0000-000000000404','00000000-0000-0000-0000-000000000001','approved','Manipulator actuator checkout','Motor Bench',now()-interval '4 days',now()+interval '1 day',now()-interval '6 days');
insert into public.request_lines (id,request_id,catalog_item_id,requested_quantity,member_remarks) values
('00000000-0000-0000-0000-000000000413','00000000-0000-0000-0000-000000000403','00000000-0000-0000-0000-000000000101',2,'Pickup fixture'),
('00000000-0000-0000-0000-000000000414','00000000-0000-0000-0000-000000000404','00000000-0000-0000-0000-000000000102',4,'Actuator characterization');
insert into public.request_line_decisions (request_line_id,decision,approved_quantity,approved_start,approved_end,actor_id) values
('00000000-0000-0000-0000-000000000413','approved',2,now()-interval '1 hour',now()+interval '6 days','00000000-0000-0000-0000-000000000004'),
('00000000-0000-0000-0000-000000000414','approved',4,now()-interval '4 days',now()+interval '1 day','00000000-0000-0000-0000-000000000004');
insert into public.reservations (id,request_id,borrower_id,status,starts_at,ends_at,pickup_deadline) values
('00000000-0000-0000-0000-000000000501','00000000-0000-0000-0000-000000000403','00000000-0000-0000-0000-000000000001','ready_for_pickup',now()-interval '1 hour',now()+interval '6 days',now()+interval '6 hours'),
('00000000-0000-0000-0000-000000000502','00000000-0000-0000-0000-000000000404','00000000-0000-0000-0000-000000000001','issued',now()-interval '4 days',now()+interval '1 day',now()-interval '3 days');
insert into public.reservation_lines (id,reservation_id,request_line_id,catalog_item_id,approved_quantity,remaining_quantity) values
('00000000-0000-0000-0000-000000000511','00000000-0000-0000-0000-000000000501','00000000-0000-0000-0000-000000000413','00000000-0000-0000-0000-000000000101',2,2),
('00000000-0000-0000-0000-000000000512','00000000-0000-0000-0000-000000000502','00000000-0000-0000-0000-000000000414','00000000-0000-0000-0000-000000000102',4,0);
insert into public.loans (id,borrower_id,reservation_id,handler_id,handover_at,status,remarks) values
('00000000-0000-0000-0000-000000000601','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000502','00000000-0000-0000-0000-000000000005',now()-interval '4 days','active','Fictional active checkout');
insert into public.loan_lines (id,loan_id,catalog_item_id,reservation_line_id,issued_quantity,unresolved_quantity,outgoing_condition,due_at) values
('00000000-0000-0000-0000-000000000611','00000000-0000-0000-0000-000000000601','00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000512',4,4,'perfect',now()+interval '1 day');

insert into public.notifications (recipient_id,event_type,title,body,deduplication_key) values
('00000000-0000-0000-0000-000000000001','request_submitted','Request received','Your request is ready for staff review.','seed-notification-request-submitted-0001'),
('00000000-0000-0000-0000-000000000002','system_notice','Workshop access','The fabrication room closes at 18:00 on Friday.','seed-notification-system-notice-0002');
insert into public.contacts (contact_type,name,responsibility,institutional_email,phone,visibility,availability,sort_order) values
('equipment','Meera Joshi','Equipment handover and returns','meera.joshi@iiitp.ac.in','+91 90000 00005','member','Mon–Fri, 17:00–19:00',1),
('club_leadership','Vivaan Iyer','Request approvals','vivaan.iyer@iiitp.ac.in',null,'student','Weekdays after 17:00',2),
('app_support','R.O.F.I.E.S Systems','Access and application support','rofies-support@iiitp.ac.in',null,'student','Reply within two club days',3);
insert into public.policy_values (scope_type,key,value,changed_by) values
('global','club_timezone','"Asia/Kolkata"'::jsonb,'00000000-0000-0000-0000-000000000006'),
('global','due_reminder_hours','[48,24]'::jsonb,'00000000-0000-0000-0000-000000000006');
insert into public.system_notices (severity,audience,title,body,starts_at,ends_at,created_by) values
('information','all','Lab move complete','Catalog locations are current after the cabinet relabeling exercise.',now()-interval '1 day',now()+interval '6 days','00000000-0000-0000-0000-000000000006');
insert into public.audit_events (id,actor_id,action,target_type,target_id,reason) values
('00000000-0000-0000-0000-000000000901','00000000-0000-0000-0000-000000000006','seed.created','system',null,'Fictional local dataset initialized');
