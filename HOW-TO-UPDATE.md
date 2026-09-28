# How to update your site

Your CV content lives in the **`_data/`** folder, one file per section.
You never need to touch HTML or CSS to change what the site says.

| To change…                   | Edit this file              |
|------------------------------|-----------------------------|
| Name, bio, links, badges     | `_data/profile.yml`         |
| Degrees                      | `_data/education.yml`       |
| Jobs & internships           | `_data/experience.yml`      |
| Papers                       | `_data/publications.yml`    |
| Talks & posters              | `_data/presentations.yml`   |
| Grants                       | `_data/grants.yml`          |
| Honors & awards              | `_data/honors.yml`          |
| Poster awards                | `_data/poster_awards.yml`   |
| Leadership, committees       | `_data/service.yml`         |
| Skills, affiliations, volunteering | `_data/skills.yml`, `_data/affiliations.yml`, `_data/volunteer.yml` |

## From any computer (no setup)

1. Go to **github.com/L12D2/L12D2.github.io**
2. Open `_data/` and click the file you want (e.g. `publications.yml`)
3. Click the ✏️ pencil icon
4. Copy an existing entry, paste it **at the top**, and change the text
5. Click **Commit changes…** → **Commit changes**
6. Wait ~1 minute, then refresh **https://l12d2.github.io**

Tip: press the **`.`** key on the repo page to open a full editor in your browser.

## YAML rules of thumb

- A new item starts with `- ` (dash + space)
- **Indent with spaces, never tabs.** Line things up with the entry above
- Wrap text in `"double quotes"` if it contains a colon `:` or starts with `*`
- `**bold**` and `*italic*` work in bios, degrees, venues and interests

## Did something break?

Check the **Actions** tab in the repo. A red ❌ means a typo in a YAML file,
and clicking it shows which file and line. Fix it, commit, and the site rebuilds.
Every past version is saved, so nothing is ever lost.

## Adding a PDF of your CV

Upload the PDF into the `assets/` folder (**Add file → Upload files**), then set
`cv_pdf: /assets/yourfile.pdf` in `_data/profile.yml`. A download button appears.
