# Assemble index.html à partir de src/ (style et calculs partagés avec le prototype Claude)
import pathlib
r = pathlib.Path(__file__).parent
t = (r/'src/template.html').read_text()
t = t.replace('{{CSS}}', (r/'src/style.css.html').read_text()).replace('{{CALC}}', (r/'src/calc.js').read_text()).replace('{{APP}}', (r/'src/app.js').read_text())
(r/'index.html').write_text(t)
print('index.html', len(t))
