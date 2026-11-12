# Chantiers

Un panneau à côté du chat de Claude Code qui montre vos sessions par projet : celles où Claude travaille, celles qui ont une PR ouverte, celles touchées dans les dernières 24 heures. Un clic sur une session l'ouvre.

## Ce que vous voyez

- Une carte par projet. Le projet vient de vos sections de la barre latérale, sinon du nom du dossier.
- Une pastille par session : vert quand Claude travaille, jaune pour une PR ouverte, bleu pour une activité récente, gris pour une session inactive.
- Les sessions inactives sont masquées. Un bouton en bas du panneau les affiche.
- Une barre au-dessus du champ de saisie, avec le bouton **▤ Chantiers** pour ouvrir ou fermer le panneau. La commande `/chantiers` fait la même chose.
- La liste se met à jour toute seule toutes les 15 secondes.

## Prérequis

L'app desktop Claude Code sur Mac. Le panneau lit la liste des sessions avec un outil propre à l'app et ouvre une session avec la commande macOS `open`. Dans le terminal ou sous Windows, il affiche « Lecture impossible ».

## Installation

Depuis un terminal :

```bash
claude plugin install chantiers --marketplace ChristopheHvd/claude-chantiers
```

Dans une session Claude Code lancée depuis un terminal :

```
/plugin install chantiers --marketplace ChristopheHvd/claude-chantiers
```

Dans l'app desktop, où `/plugin` ne marche pas : cliquez sur **+** à côté du champ de saisie, puis **Plugins**, **Add marketplace** avec `ChristopheHvd/claude-chantiers`, puis **Add plugin**.

Le panneau apparaît dans les nouvelles sessions.

## Désinstallation

```bash
claude plugin uninstall chantiers
```
