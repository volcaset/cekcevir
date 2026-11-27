# Modelleri telefonun indireceği biçime getirir: 16 MB'lık parçalar + manifest.json
import json, os, shutil, sys
SRC, DST = sys.argv[1], sys.argv[2]
CHUNK = 16 * 1024 * 1024
FILES = ['config.json', 'generation_config.json', 'tokenizer.json', 'tokenizer_config.json',
         'onnx/encoder_model_quantized.onnx', 'onnx/decoder_model_merged_quantized.onnx']
for name in ['opus-mt-tr-ar', 'opus-mt-ar-tr']:
    src = os.path.join(SRC, 'Helsinki-NLP', name)
    dst = os.path.join(DST, name)
    manifest = {'source': 'Helsinki-NLP/' + name, 'license': 'CC-BY 4.0 / Apache-2.0', 'files': {}}
    for f in FILES:
        p = os.path.join(src, f)
        size = os.path.getsize(p)
        os.makedirs(os.path.dirname(os.path.join(dst, f)), exist_ok=True)
        if size <= CHUNK:
            shutil.copy(p, os.path.join(dst, f))
            manifest['files'][f] = {'size': size, 'parts': 0}
            continue
        n = 0
        with open(p, 'rb') as fp:
            while True:
                b = fp.read(CHUNK)
                if not b: break
                with open(os.path.join(dst, f'{f}.{n:03d}'), 'wb') as o: o.write(b)
                n += 1
        manifest['files'][f] = {'size': size, 'parts': n}
    json.dump(manifest, open(os.path.join(dst, 'manifest.json'), 'w'), indent=1)
    print(name, {k: v['size'] for k, v in manifest['files'].items()})
