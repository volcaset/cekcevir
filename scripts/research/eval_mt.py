import json, random, time, sys
import sacrebleu, torch
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM, MarianTokenizer
torch.set_num_threads(4)
d = json.load(open('www/data/tatoeba-tr-ar.json'))['pairs']
random.seed(7)
cand = [p for p in d if 4 <= len(p[0].split()) <= 12]
S = random.sample(cand, 200)
TR = [p[0] for p in S]; AR = [p[1] for p in S]
EXTRA_TR = ["Merhaba, havalimanına nasıl gidebilirim?", "Bu ne kadar?", "Hesabı alabilir miyim lütfen?", "Eczane nerede?", "Bana yardım edebilir misiniz?", "Taksiyle otele gitmek istiyorum."]
EXTRA_AR = ["كيف يمكنني الذهاب إلى المطار؟", "بكم هذا؟", "أين أقرب صيدلية؟", "هل تتكلم التركية؟", "أريد غرفة لليلتين."]
cache = {}
def load(m):
    if m not in cache:
        tok = AutoTokenizer.from_pretrained(m)
        mod = AutoModelForSeq2SeqLM.from_pretrained(m).eval()
        cache[m] = (tok, mod)
    return cache[m]
def run(m, texts, prefix=None, nllb=None):
    tok, mod = load(m)
    out = []
    pre = ''
    if prefix and getattr(tok, 'supported_language_codes', None):
        for p in prefix:
            if p in tok.supported_language_codes: pre = p + ' '; break
    for i in range(0, len(texts), 16):
        b = [pre + t for t in texts[i:i+16]]
        kw = {}
        if nllb:
            tok.src_lang = nllb[0]; kw['forced_bos_token_id'] = tok.convert_tokens_to_ids(nllb[1])
        enc = tok(b, return_tensors='pt', padding=True)
        with torch.no_grad():
            g = mod.generate(**enc, max_new_tokens=128, num_beams=1, **kw)
        out += tok.batch_decode(g, skip_special_tokens=True)
    return out
NL = 'facebook/nllb-200-distilled-600M'
systems = {
 'tr-ar': {
   'nllb600': lambda x: run(NL, x, nllb=('tur_Latn','arb_Arab')),
   'direct_tr-ar': lambda x: run('Helsinki-NLP/opus-mt-tr-ar', x),
   'pivot_bigtr-en+base_en-ar': lambda x: run('Helsinki-NLP/opus-mt-en-ar', run('Helsinki-NLP/opus-mt-tc-big-tr-en', x), prefix=['>>arb<<','>>ara<<']),
   'pivot_bigtr-en+big_en-ar': lambda x: run('Helsinki-NLP/opus-mt-tc-big-en-ar', run('Helsinki-NLP/opus-mt-tc-big-tr-en', x), prefix=['>>arb<<','>>ara<<']),
 },
 'ar-tr': {
   'nllb600': lambda x: run(NL, x, nllb=('arb_Arab','tur_Latn')),
   'direct_ar-tr': lambda x: run('Helsinki-NLP/opus-mt-ar-tr', x),
   'pivot_base_ar-en+big_en-tr': lambda x: run('Helsinki-NLP/opus-mt-tc-big-en-tr', run('Helsinki-NLP/opus-mt-ar-en', x)),
   'pivot_big_ar-en+big_en-tr': lambda x: run('Helsinki-NLP/opus-mt-tc-big-en-tr', run('Helsinki-NLP/opus-mt-tc-big-ar-en', x)),
 }}
for dirn, sy in systems.items():
    src, ref, extra = (TR, AR, EXTRA_TR) if dirn == 'tr-ar' else (AR, TR, EXTRA_AR)
    print(f'\n######## {dirn}', flush=True)
    for name, f in sy.items():
        t = time.time()
        try:
            hyp = f(src); ex = f(extra)
        except Exception as e:
            print(name, 'ERROR', e); continue
        bleu = sacrebleu.corpus_bleu(hyp, [ref]).score
        chrf = sacrebleu.corpus_chrf(hyp, [ref]).score
        print(f'## {name}: BLEU {bleu:.1f} chrF {chrf:.1f} ({time.time()-t:.0f}s)', flush=True)
        for s, h in zip(extra, ex): print(f'   {s} => {h}')
        for i in range(5): print(f'   [{src[i]}] ref={ref[i]} hyp={hyp[i]}')
