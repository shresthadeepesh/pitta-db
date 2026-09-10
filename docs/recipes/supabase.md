# Supabase

Supabase gives you three connection strings and they are not interchangeable.
Pick by what you are doing.

| | Direct connection | Session pooler | Transaction pooler |
| --- | --- | --- | --- |
| Port | 5432 | 6543 | 6543 |
| Host | `db.<ref>.supabase.co` | `aws-0-<region>.pooler.supabase.com` | `aws-0-<region>.pooler.supabase.com` |
| User | `postgres` | `postgres.<ref>` | `postgres.<ref>` |
| IPv4 | add-on required | yes | yes |
| Prepared statements | yes | yes | **no** |
| Good for Pitta | **yes** | yes | no |

**Use the direct connection or the session pooler.** The transaction pooler
hands you a different backend per transaction, which breaks prepared statements,
session settings, temporary tables and cursors — and the grid pages results with
a cursor.

## The profile

| Field | Value |
| --- | --- |
| Host | `db.abcdefghijklm.supabase.co` |
| Port | `5432` |
| Database | `postgres` |
| User | `postgres` |
| Password | the database password from **Project Settings → Database**, not your Supabase account password and not the `anon` key |
| SSL mode | `verify-full` |
| Environment | `prod` — a Supabase project is somebody's production, including yours |

Supabase's certificate chains to a public CA, so no CA file is needed. The
project settings page also offers a certificate download if you want to pin it.

## IPv4

Direct connections are IPv6-only unless you have the IPv4 add-on. If your
network is IPv4-only, `db.<ref>.supabase.co` will not resolve to anything you
can reach — use the session pooler, which is dual-stack.

Under Remote-SSH this is the remote's connectivity that matters, not your
laptop's.

## What you will see

`auth`, `storage`, `realtime` and `extensions` schemas alongside `public`. They
are the platform's, and they are worth leaving alone. `pitta.explorer.showSystemObjects`
does not hide them, because they are not system schemas — they are ordinary
schemas that belong to Supabase.

Row Level Security policies show under a table's **Structure** tab. Note that
connecting as `postgres` **bypasses RLS**: you are seeing every row, not the
rows an application user would see. That is the point of a superuser connection
and the reason to be careful with it.

## Read-only access

Make a scoped role and use it for the profile you leave open all day:

```sql
create role pitta_ro login password 'chosen-password';
grant connect on database postgres to pitta_ro;
grant usage on schema public to pitta_ro;
grant select on all tables in schema public to pitta_ro;
alter default privileges in schema public grant select on tables to pitta_ro;
```

Tick **Read-only** on the profile as well. The server enforces it and Pitta
refuses to send the statement in the first place.
