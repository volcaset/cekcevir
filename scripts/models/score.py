import json, sys, sacrebleu
d = json.load(open(sys.argv[1]))
for m, v in d.items():
    print(m, 'BLEU %.1f chrF %.1f' % (sacrebleu.corpus_bleu(v['hyp'], [v['ref']]).score, sacrebleu.corpus_chrf(v['hyp'], [v['ref']]).score))
