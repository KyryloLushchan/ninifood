-- Радиус вокруг «Финиша курьера», км: точки внутри него — всегда отдельный последний рейс (кухня → эти точки → финиш).
insert into public.settings (key, value, is_public) values ('courier_finish_radius_km', '3', false) on conflict (key) do nothing;
