import os
import UnityPy
from PIL import Image

def hex_to_rgba(hex_color):
    """Konversi HEX color ke RGBA float (0.0 - 1.0)"""
    hex_color = hex_color.lstrip('#')
    if len(hex_color) == 6:
        r, g, b = tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))
        return (r/255.0, g/255.0, b/255.0, 1.0)
    elif len(hex_color) == 8:
        r, g, b, a = tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4, 6))
        return (r/255.0, g/255.0, b/255.0, a/255.0)
    return (1.0, 1.0, 1.0, 1.0)

def is_color_black(r, g, b, threshold=0.05):
    """Deteksi apakah warna mendekati hitam pekat"""
    return r <= threshold and g <= threshold and b <= threshold

def process_asset_bundle(file_path, output_path, target_hex_color):
    # Load AssetBundle
    env = UnityPy.load(file_path)
    
    # Parse warna target
    target_rgba = hex_to_rgba(target_hex_color)
    target_is_black = is_color_black(target_rgba[0], target_rgba[1], target_rgba[2])

    # Iterasi semua object di dalam bundle
    for obj in env.objects:
        
        # 1. Menetralkan Warna Asli (Texture2D)
        if obj.type.name == "Texture2D":
            data = obj.read()
            try:
                img = data.image
                if img.mode == 'RGBA':
                    # Pisahkan channel untuk mempertahankan Alpha (transparansi)
                    r, g, b, a = img.split()
                    # Konversi RGB ke Grayscale
                    gray = Image.merge("RGB", (r, g, b)).convert("L")
                    # Gabungkan kembali Grayscale dengan Alpha asli
                    new_img = Image.merge("LA", (gray, a)).convert("RGBA")
                    data.image = new_img
                    data.save()
                elif img.mode == 'RGB':
                    new_img = img.convert("L").convert("RGB")
                    data.image = new_img
                    data.save()
                print(f"[Texture2D] Berhasil menetralkan (Grayscale): {data.name}")
            except Exception as e:
                print(f"[Texture2D] Error memproses {data.name}: {e}")

        # 2. Memasukkan Warna Baru (ParticleSystem)
        elif obj.type.name == "ParticleSystem":
            # Gunakan TypeTree untuk memodifikasi struktur data secara langsung
            tree = obj.read_typetree()
            modified = False
            
            # A. Modifikasi InitialModule (startColor)
            if "InitialModule" in tree and "startColor" in tree["InitialModule"]:
                start_color = tree["InitialModule"]["startColor"]
                new_color_dict = {"r": target_rgba[0], "g": target_rgba[1], "b": target_rgba[2], "a": target_rgba[3]}
                
                if "maxColor" in start_color:
                    start_color["maxColor"] = new_color_dict
                    modified = True
                if "minColor" in start_color:
                    start_color["minColor"] = new_color_dict
                    modified = True
            
            # B. Modifikasi ColorModule (Jika aktif)
            if "ColorModule" in tree and tree["ColorModule"].get("enabled", 0) != 0:
                # Struktur gradient bisa bervariasi, kita override color keys-nya
                # Umumnya parameter warnanya terdapat di tree["ColorModule"]["gradient"]
                # TODO: Iterasi dan set semua key ke warna target
                modified = True
                
            # C. Modifikasi CustomDataModule (Jika aktif)
            if "CustomDataModule" in tree and tree["CustomDataModule"].get("enabled", 0) != 0:
                # Modifikasi color0 / color1 jika digunakan
                modified = True

            if modified:
                obj.save_typetree(tree)
                print(f"[ParticleSystem] Berhasil menyuntikkan warna")
            
        # 3. Penanganan Khusus Warna Hitam (Material & Blend Mode)
        elif obj.type.name == "Material":
            tree = obj.read_typetree()
            modified = False
            
            if "m_SavedProperties" in tree:
                saved_props = tree["m_SavedProperties"]
                
                # A. Ubah warna Material (_TintColor, _EmissionColor, dll)
                if "m_Colors" in saved_props:
                    for color_prop in saved_props["m_Colors"]:
                        name = color_prop.get("first", "")
                        if name in ["_TintColor", "_EmissionColor", "_Color"]:
                            color_prop["second"] = {"r": target_rgba[0], "g": target_rgba[1], "b": target_rgba[2], "a": target_rgba[3]}
                            modified = True
                
                # B. Ubah Blend Mode jika warna yang diinput adalah Hitam
                if target_is_black and "m_Floats" in saved_props:
                    for float_prop in saved_props["m_Floats"]:
                        name = float_prop.get("first", "")
                        if name == "_SrcBlend":
                            float_prop["second"] = 5.0 # 5 = SrcAlpha
                            modified = True
                        elif name == "_DstBlend":
                            float_prop["second"] = 10.0 # 10 = OneMinusSrcAlpha
                            modified = True
                            
            if modified:
                obj.save_typetree(tree)
                mode_str = "Alpha Blended (Hitam)" if target_is_black else "Warna Custom"
                print(f"[Material] Berhasil memodifikasi properti Material. Mode: {mode_str}")

    # Repack / simpan kembali ke file .unity3d baru
    with open(output_path, "wb") as f:
        f.write(env.file.save())
    print(f"\nSelesai! File disimpan di: {output_path}")

if __name__ == "__main__":
    # Script ini dapat diintegrasikan sebagai API Python backend
    # Contoh pemanggilan:
    process_asset_bundle(
        file_path="input_effect.unity3d", 
        output_path="output_effect.unity3d", 
        target_hex_color="#000000" # Hitam pekat untuk test Alpha Blended
    )
