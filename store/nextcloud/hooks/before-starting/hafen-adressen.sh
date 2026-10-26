#!/bin/sh
# Hafen: erlaubte Adressen (trusted_domains) bei jedem Start setzen.
# NEXTCLOUD_TRUSTED_DOMAINS wirkt im offiziellen Image nur bei der Erstinstallation –
# kommt später ein Name dazu (Router-Name, Tailscale), lehnte Nextcloud ihn sonst ab.
# Nie mit Fehler enden: Ein fehlgeschlagener Hook bricht den Start des Containers ab.
occ() { php /var/www/html/occ "$@" >/dev/null 2>&1; }
occ status --no-warnings || { echo "Hafen: Nextcloud noch nicht eingerichtet, Adressen folgen beim nächsten Start"; exit 0; }
occ config:system:delete trusted_domains || true
i=0
for h in localhost $NEXTCLOUD_TRUSTED_DOMAINS; do
  occ config:system:set trusted_domains "$i" --value="$h" || true
  i=$((i + 1))
done
echo "Hafen: $i erlaubte Adressen gesetzt"
exit 0
