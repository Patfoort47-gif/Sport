"""One-time interactive Garmin login. Writes a secret session file; never prints it."""
import argparse
import getpass
import logging
import os
from pathlib import Path
import sys

from garminconnect import Garmin


def main():
    parser = argparse.ArgumentParser(description='Connecter Garmin et créer une session privée pour la synchronisation.')
    parser.add_argument('--output', type=Path, default=Path.home() / '.sport-garmin-session.json')
    args = parser.parse_args()
    logging.disable(logging.CRITICAL)
    email = input('Adresse e-mail Garmin : ').strip()
    password = getpass.getpass('Mot de passe Garmin (masqué) : ')
    client = Garmin(email, password, prompt_mfa=lambda: getpass.getpass('Code MFA Garmin : '))
    try:
        client.login()
        session = client.client.dumps()
        # Never overwrite an existing file or follow a symlink.
        fd = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as stream:
            stream.write(session)
    except FileExistsError:
        print('Le fichier existe déjà. Choisissez un autre chemin avec --output.', file=sys.stderr)
        return 1
    except Exception:
        print('Connexion Garmin impossible. Vérifiez les identifiants/MFA ou réessayez ultérieurement. Aucun secret affiché.', file=sys.stderr)
        return 1
    print(f'Session privée enregistrée : {args.output}. Suivez le guide pour la placer dans GitHub Secrets ; ne la commitez pas.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
