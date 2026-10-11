#!/usr/bin/env python3
"""One-off catalogue of the 24 uploaded texture sheets (tex_01..tex_24):
grid size + per-tile tags so level themes can find the right tiles.
Run: python3 tools/catalog_textures.py && python3 tools/process_art.py"""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
C = os.path.join(ROOT, 'tools', 'art_config.json')

def T(n, sid, cols, rows, desc, tags, rowTags, tileTags, rowCols=None):
    s = {"id": sid, "type": "texture_grid", "description": desc, "src": "art/raw/textures/tex_%02d.webp" % n,
         "out": "assets/textures/%s.png" % sid, "cols": cols, "rows": rows, "size": 64, "inset": 4,
         "tags": tags, "rowTags": rowTags, "tileTags": tileTags}
    if rowCols: s["rowCols"] = rowCols
    return s

S = []
S.append(T(1, 'tx01_industrial_4x4', 4, 4, '16 large industrial tiles', ['industrial'], ['wall metal', 'wall stone', 'wall tech', 'wall'],
 [['metal panel olive rivet military', 'metal rust vent industrial', 'metal armor dark octagon station', 'vent grille rust industrial'],
  ['stone block dark castle', 'stone block brown', 'stone flagstone dark floor', 'stone carved tech gothic accent'],
  ['pipes cables industrial', 'tech panel cyan station lights', 'tech tubes orange glow', 'pipes rust industrial'],
  ['concrete stained ruin', 'metal hazard stripes accent', 'lava rock red hell glow floor hazard', 'door tech red station']]))
S.append(T(2, 'tx02_mixed', 10, 5, 'metals, stones, machinery, organic, doors', [], ['metal wall', 'stone wall', 'tech machinery wall', 'organic alien wall', 'door wall'],
 [['metal corrugated blue', 'metal copper rivet', 'metal steel slats', 'metal teal rivet', 'metal hex dark floor', 'metal red vent', 'metal beige rivet', 'metal perforated floor grate', 'metal brass tech', 'metal corrugated rust'],
  ['stone moss ruin', 'stone sandstone desert', 'stone purple arcane', 'stone red', 'stone blue moss', 'marble white cracked heaven', 'stone dark rough cave', 'stone tan desert', 'stone ice frozen', 'brick dark'],
  ['pipes red cable', 'fans vent', 'tubes green glow toxic lab', 'copper boxes industrial', 'tubes amber glow', 'vent louver', 'valves red industrial', 'tubes blue electric glow lab', 'control panel tech station', 'machinery hazard industrial'],
  ['metal carved diamond dark', 'sandstone sigil red desert', 'fossil stone ammonite', 'scales purple organic', 'crystal green vein rock glow', 'flesh red veins hell gore', 'biomech ribs black alien', 'stone gold circuit', 'rock cyan veins glow', 'bone lattice'],
  ['door brass ornate castle', 'door tech red station', 'stone window barred castle prison', 'porthole city window', 'window gothic red castle cathedral', 'crate mesh metal', 'stone brace castle', 'door vented metal', 'door vault hazard', 'door tech orange lights']]))
S.append(T(3, 'tx03_scifi_panels', 10, 5, 'clean sci-fi station panels and machinery', ['scifi', 'station', 'tech'], ['metal panel wall', 'machinery wall', 'interior equipment wall', 'door window wall', 'damaged wall'],
 [['white', 'dark', 'blue', 'olive military', 'beige', 'ribs steel', 'slats steel', 'hex floor', 'rust', 'white'],
  ['pipes', 'copper pipes', 'vent grille', 'fans', 'coil heater', 'conduit', 'pipes colored', 'piston', 'piston hazard', 'machinery'],
  ['computer radar screen', 'server rack screen', 'medical lab', 'specimen tubes lab', 'padded floor', 'gas tanks', 'electrical panel', 'circuit screen', 'lab tubes', 'lockers white'],
  ['door hazard', 'door shutter', 'door red', 'porthole space window', 'window space earth', 'shutter hazard door', 'window frosted', 'hatch vault door', 'door red hazard', 'door blue light'],
  ['lava crack hell glow', 'wires broken', 'pipes rust', 'acid leak green toxic', 'screen broken', 'bullet holes', 'energy purple column glow', 'frozen pipes ice', 'alarm red eye', 'radar gold']]))
S.append(T(4, 'tx04_scifi_interior', 11, 5, 'sci-fi interior: panels, equipment, rooms, doors/windows, damaged', ['scifi', 'station', 'tech'], ['metal panel wall', 'machinery wall', 'interior equipment wall', 'door window wall', 'damaged wall'],
 [['vent grey', 'stripe orange beige', 'tiles blue floor', 'hazard diagonal', 'triangle panel', 'green military', 'slats grey', 'hex mesh grate floor', 'red rivet', 'red rivet', 'light fluorescent'],
  ['reactor coil', 'circuit columns', 'cryo tubes blue lab', 'hoses yellow', 'turbine', 'canisters gas', 'conduits flex', 'tools panel', 'tools wrench', 'grate copper', 'valves red'],
  ['bunk bed', 'kitchen counter', 'chair', 'stripe teal beige', 'terrarium plants lab', 'cryo pod lab', 'lab microscope', 'radar server', 'locker', 'supplies medical'],
  ['door vault', 'door sliding hazard', 'door shutter', 'window hex nebula space', 'window ship space', 'window slit space', 'door valve', 'tank amber specimen', 'hologram planet map', 'grate crate'],
  ['ice frosted frozen', 'lockers rust', 'cracked wall ruin', 'burnt wall', 'pipes moss slime', 'window broken', 'tank purple portal glow', 'heater orange glow', 'vines overgrown', 'tube cyan glow']], rowCols=[11, 11, 10, 10, 10]))
NAT = ['nature']
S.append(T(5, 'tx05_nature_a', 10, 5, 'rocks, dirt, vegetation, bark/crystals, volcanic/ice', NAT, ['rock floor wall', 'dirt floor', 'grass vegetation floor', 'bark crystal wall', 'volcanic ice floor'],
 [['rock grey cracked mountain', 'rock sandstone layered desert canyon', 'rock slate dark', 'earth cracked white desert', 'pebbles', 'rock red mars canyon', 'rock layered brown', 'rock purple', 'basalt black volcano', 'granite'],
  ['soil dark', 'clay cracked desert', 'dirt sandy desert', 'earth red cracked mars', 'gravel', 'roots dirt forest', 'mud stones', 'mud wet swamp', 'rock striped red canyon', 'leaves dead forest'],
  ['moss rock forest', 'lichen rock', 'ferns jungle', 'ivy jungle', 'roots tree forest', 'grass', 'moss ground swamp', 'vines stone ruin', 'weeds ground', 'clover'],
  ['bark tree forest', 'bark birch', 'bark redwood', 'driftwood', 'bark burnt hell', 'crystal blue cave', 'stalactites cave', 'stalactites moss cave', 'crystal amber cave', 'snow'],
  ['lava cracks volcano hell glow hazard', 'lava rock swirl volcano', 'pumice', 'obsidian volcano', 'ice glacier frozen', 'frost ground frozen', 'snow coal', 'sulfur yellow volcano', 'rock layered red canyon', 'roots rock']]))
S.append(T(6, 'tx06_nature_b', 10, 5, 'rocks, soils, plants, bark, ice/coral', NAT, ['rock floor wall', 'dirt floor', 'vegetation floor', 'bark rock wall', 'misc floor'],
 [['cobble slate blue', 'granite pink', 'rock yellow desert', 'rock green moss', 'pebbles white', 'pebbles dark', 'pebbles colored', 'sandstone porous desert', 'rock striped red canyon', 'gravel grey'],
  ['dirt red mars', 'soil dark', 'sand dunes desert', 'dirt orange', 'clay cracked desert', 'clay cracked brown', 'dirt rocky dark', 'roots soil', 'ash ground grey volcano', 'sand shells beach'],
  ['clover', 'moss forest', 'pine needles forest', 'leaves autumn', 'leaves dark jungle', 'ferns jungle', 'straw dry', 'moss stones', 'leaves brown', 'succulents'],
  ['bark pine', 'bark sycamore', 'bark cork', 'roots dry', 'roots mud swamp', 'lichen rock', 'lichen orange', 'marble beige', 'fossils stone', 'rock moss cracked'],
  ['coral red sponge', 'coal black', 'snow', 'ice cracked frozen', 'snow rocks mountain', 'sprouts soil', 'moss green swamp', 'rock red', 'crystals purple dirt cave', 'salt cracked white desert']]))
S.append(T(7, 'tx07_nature_c', 10, 5, 'minerals, soils, foliage, bark, ice/rust/embers', NAT, ['rock mineral floor wall', 'dirt floor', 'foliage floor', 'bark wall', 'misc floor'],
 [['rock red veined hell', 'crystal green', 'obsidian shards black', 'gravel beige', 'crystals blue cave', 'quartz pink', 'slate purple', 'gravel red brown', 'basalt gold flecks', 'pebbles red mars'],
  ['soil worms', 'sand roots', 'gravel dark', 'dirt orange', 'clay olive cracked swamp', 'leaves brown', 'sand black volcanic volcano', 'sand tan desert', 'gravel red mars', 'stone olive'],
  ['moss forest', 'lichen white', 'leaves yellow', 'leaves maple', 'cedar', 'clover flowers', 'clover', 'ground cover', 'leaves dead', 'mushrooms moss swamp'],
  ['bark oak', 'bark orange', 'bark moss', 'vines jungle', 'bark fungus', 'bark moss roots', 'lichen blue', 'seaweed rock water', 'fossil shells', 'roots dirt'],
  ['ice crystals frozen', 'snow dirt', 'snow ash', 'marble jade', 'copper turquoise', 'rust red', 'embers coal volcano hell glow', 'gravel purple', 'quartz crystals cave', 'frost earth frozen']]))
S.append(T(8, 'tx08_grimy_industrial', 10, 5, 'grimy DOOM-style industrial', ['industrial', 'grimy'], ['metal wall', 'pipes wall', 'metal floor', 'machinery wall', 'decay wall floor'],
 [['metal dark rivet', 'metal red rust', 'tile white cracked hospital', 'metal green rust', 'metal oily dark', 'metal diagonal rivet', 'metal brass', 'metal damaged', 'metal blue cracked', 'metal splattered'],
  ['pipes vertical', 'pipes copper', 'tubes green toxic glow', 'cables', 'mesh broken', 'grates windows', 'slats vertical', 'pipes machinery', 'hoses', 'mesh rust'],
  ['brick metal dark', 'hex plates floor', 'diamond plate floor', 'slots metal floor', 'perforated floor grate', 'tile bloody gore hospital', 'marble black cracked', 'plates boxes', 'vent grille', 'checker grime floor'],
  ['tubes red glow', 'tubes green glow toxic', 'circuit orange glow', 'circuit dark', 'tubes purple glow', 'machinery teal', 'glass broken machinery', 'fans', 'pipes rows', 'slime green toxic'],
  ['lava cracks hell glow hazard', 'metal wet', 'pitted green', 'drips frozen ice', 'flesh cables gore hell', 'moss rough', 'drips black', 'plates damaged', 'blood metal gore hell', 'acid cracks green toxic glow hazard']]))
S.append(T(9, 'tx10_organic_a', 10, 5, 'organic/alien flesh, bone, eggs, glowing growths', ['organic', 'alien'], ['flesh wall', 'flesh wall', 'infested metal wall', 'glowing wall', 'flesh floor wall'],
 [['veins red sac flesh hell', 'neurons purple', 'coils black biomech', 'bone lattice', 'muscle red ribbed flesh gore', 'scales olive', 'orbs amber', 'bone lattice light', 'scales dark', 'thorns brown hell'],
  ['veins red web flesh', 'fungus purple gills', 'veins green', 'flesh spiral', 'bone web', 'bubbles gold', 'eggs blue spotted', 'scales dripping dark', 'fungus shelves tan', 'flesh red porous gore'],
  ['veins metal infested', 'veins purple stone', 'vines grate', 'eggs tile infested', 'ribs metal biomech', 'veins brick hell', 'sap amber pipes', 'slime green chains toxic', 'veins grate red', 'fungus pipes'],
  ['eggs green glow toxic', 'web cyan glow', 'veins purple glow arcane', 'orbs orange glow', 'cracks red glow hell lava', 'bubbles teal', 'crystals blue', 'slime yellow web', 'crystals pink', 'amber glow orange'],
  ['flesh web pink gore', 'scales brown', 'bubbles black', 'bone web white', 'roots dark', 'bone foam white', 'bubbles purple', 'sponge tan', 'flesh leafy green', 'scales red glow hell']]))
S.append(T(10, 'tx11_cave_liquids', 10, 5, 'cave rock, floors, liquids, details, ruined blocks', ['cave'], ['rock wall', 'floor', 'liquid floor hazard', 'floor', 'wall'],
 [['rock dark', 'rock brick red', 'crystal black', 'rock yellow lichen', 'crystal purple rock', 'rock orange layered canyon', 'rock stalactite grey', 'rock beige', 'rock green veins glow', 'crystals amber rock'],
  ['gravel embers volcano', 'gravel red mars hell', 'rocks grey', 'roots soil', 'bones dirt crypt', 'leaves dead', 'dirt orange', 'crystals purple', 'roots black', 'frost rock frozen'],
  ['=lava lava hell volcano glow', '=red_lava lava red hell glow', '=acid acid green toxic glow', '=swamp water swamp olive', '=oil oil black', '=ooze ooze purple arcane glow', '=blood blood gore hell', '=water water cyan', '=grey_water water grey sewer', '=honey honey amber'],
  ['roots', 'web spider crypt', 'frost crystals frozen', 'moss', 'bark lava glow', 'cracks green glow', 'crystals blue', 'bones skeleton crypt', 'eggs yellow', 'fungus brown'],
  ['brick red ruin', 'marble black', 'brick lava hell glow', 'rock bone white', 'rust metal debris', 'stone blocks dark castle', 'stone blocks lava hell glow', 'bricks moss ruin', 'sponge yellow', 'cracks red dark hell']]))
d12 = ['plain', 'stepped_plates', 'riveted_square', 'straps_horizontal', 'straps_vertical', 'shingles', 'x_brace', 'plates_L', 'inset_square', 'straps_diagonal']
S.append(T(11, 'tx12_metal_rust_gradient', 10, 5, '10 metal panel designs x 5 rust levels', ['metal', 'industrial', 'wall'], ['clean dark station', 'clean station', 'light rust', 'rust', 'heavy rust ruin'], [d12] * 5))
d13 = ['plain_riveted', 'plates', 'corrugated', 'pitted_riveted', 'straps_diagonal', 'strapped', 'strips_vertical', 'bubbled', 'slotted', 'plates_L']
S.append(T(12, 'tx13_rust_metal', 10, 5, '10 rusty metal designs x 5 decay levels', ['metal', 'rust', 'industrial', 'wall', 'grimy'], ['rust', 'rust heavy', 'rust pitted', 'rust cracked ruin', 'rust holes ruin decay'], [d13] * 5))
S.append(T(13, 'tx14_industrial_b', 10, 5, 'industrial panels, pipes, braces, glowing machinery, peeling paint', ['industrial'], ['metal wall', 'pipes wall', 'metal wall', 'machinery wall glow', 'decay wall'],
 [['tech dark', 'beige rust', 'red panels', 'green panels military', 'slabs grey', 'corrugated blue', 'tan rivet', 'hex armor', 'rivet dark', 'white panels'],
  ['pipes horizontal', 'pipes copper', 'cables colored', 'grate rust floor', 'fans', 'vent', 'metal rust', 'tech dark', 'pistons', 'mesh diamond floor'],
  ['concrete cracked', 'ribs vertical', 'louver green', 'patched rust', 'bullet holes', 'box panels', 'x brace', 'diamond brace blue', 'tech yellow panel', 'chevron dark'],
  ['circuit amber', 'tubes cyan lab', 'panel red lights', 'tubes green toxic', 'barrels purple', 'tubes orange', 'tubes blue lab', 'monitors green screen', 'machinery rust', 'machinery panel'],
  ['rust orange', 'rust blue', 'peeling white', 'peeling red', 'rust green', 'bullet holes dark', 'pipes olive', 'burnt metal', 'frozen ribs ice', 'plates sparks dark']]))
S.append(T(14, 'tx15_castle_stone', 10, 5, 'castle/gothic stone', ['castle', 'gothic', 'stone'], ['brick wall', 'carved accent wall', 'decay wall', 'detail wall', 'relief wall'],
 [['blocks dark', 'bricks red', 'moss blocks ruin', 'cracked beige', 'blocks dark', 'blocks tan desert', 'blocks blue', 'bricks purple arcane', 'cobble brown floor', 'blocks beige'],
  ['arches cathedral', 'demon skull hell', 'cross carved', 'tracery cathedral', 'windows barred prison', 'thorn knot hell', 'skull niches crypt', 'vine frieze', 'pyramid studs', 'chevron'],
  ['plaster brick ruin', 'plaster red cracked', 'plaster stained', 'mold dark', 'moss bricks ruin', 'ice stone frozen', 'blood brick gore hell', 'cobweb stone crypt', 'moss stone ruin', 'icicles stone frozen'],
  ['iron studded', 'scales green', 'chains stone dungeon', 'crate wood', 'door wood iron', 'brick iron straps', 'fleur relief ornate', 'quatrefoil dark', 'star tiles red floor', 'tapestry green ornate'],
  ['colonnade arches temple', 'rosettes cracked', 'leaf relief', 'window barred brick prison', 'gargoyle relief hell', 'fossil stone', 'marble black lava', 'crystal purple stone arcane', 'lava cracks hell glow hazard', 'brick dark']]))
S.append(T(15, 'tx16_organic_b', 10, 5, 'organic/alien flesh 2', ['organic', 'alien'], ['flesh wall', 'flesh wall', 'infested metal wall', 'glowing wall', 'flesh floor wall'],
 [['scales red hell', 'ribs black biomech', 'tendons purple', 'bone lattice', 'scales green', 'cocoons grey', 'orbs amber', 'spine bones crypt', 'veins red flesh gore', 'crust amber'],
  ['veins red star', 'scales black', 'bone holes', 'mushrooms purple', 'tendons white', 'tendons red flesh gore', 'vines green', 'scales dark', 'bubbles amber', 'cells grey'],
  ['veins metal red infested', 'bone grate', 'veins black tile', 'slime yellow metal', 'tentacles purple pipes', 'hoses biomech', 'growth green tile', 'bone metal', 'veins copper pipes', 'bone web dark'],
  ['eggs green glow toxic', 'web cyan glow', 'scales purple veins glow', 'orbs amber glow', 'scales red glow hell', 'veins blue glow', 'orbs magenta glow', 'slime yellow web', 'web cyan glow', 'wood embers glow'],
  ['roots web brown', 'scales black', 'bone web', 'oil black', 'porous grey', 'ribbed red flesh', 'bone web', 'fungus golden', 'scales purple', 'scales green']]))
S.append(T(16, 'tx17_hellforge', 10, 5, 'hellish foundry', ['hell', 'industrial'], ['metal wall', 'machinery wall', 'demonic accent wall', 'volcanic rock floor wall', 'wall'],
 [['lava pillars stone glow', 'pipes copper', 'bricks lava glow', 'metal dark panel', 'brass plate', 'stone cracked white', 'wood burning fire glow', 'blocks red stone', 'pipes vertical', 'stone brace dark'],
  ['lava slits glow', 'chains', 'mesh lava glow', 'louvers', 'pipe cross', 'pistons brass', 'grate lava diamond glow', 'pipe serpentine', 'straps riveted', 'vents'],
  ['spikes arches', 'demon skull relief', 'hooks brass', 'circuit red tile', 'marble red strips', 'flesh holes gore', 'spikes panel', 'veins gold lava glow', 'lava cracked metal glow', 'brass ornament'],
  ['lava cracks rock glow hazard volcano', 'rock red flowing', 'rock purple cracks arcane', 'rock yellow sulfur', 'rock grey veins', 'rock green pitted', 'rock red cracked', 'rock beige', 'rock blue crystals', 'rock rust lava'],
  ['rust green holes', 'brick frost black', 'stone cracked dark', 'copper plates', 'lava drips glow', 'chains rock dark', 'tech red panel', 'pipes brass lava glow', 'rock cyan cracks glow', 'lava strips glow']]))
CITY = ['city', 'urban']
S.append(T(17, 'tx18_city_facades', 10, 5, 'city facades', CITY, ['window facade wall town', 'glass tile wall downtown', 'brick wall', 'stucco wall', 'ruin decay wall'],
 [['brick red', 'brick', 'beige balcony', 'stone arch', 'brick yellow', 'siding blue village', 'shutters red village', 'concrete', 'brick black', 'ornate tan'],
  ['glass blue skyscraper', 'glass night skyscraper', 'strip windows office', 'tile white', 'tile green subway', 'granite black', 'storefront ornate', 'corrugated metal', 'brick window', 'glass dark skyscraper'],
  ['brick red', 'brick brown', 'brick white', 'brick black', 'brick yellow', 'stone grey blocks', 'stone rubble', 'stone red blocks', 'stone grey blocks', 'tile white subway'],
  ['stucco cracked', 'concrete grimy', 'plaster pink', 'paint teal brick', 'stucco pebble', 'stucco yellow', 'concrete stained', 'paint green', 'aggregate', 'siding wood dark'],
  ['brick ivy overgrown', 'stone ivy overgrown', 'blocks grimy', 'siding rust blue', 'concrete rust streaks', 'brick peeling', 'window broken concrete', 'tile broken', 'brick grime black', 'brick red painted']]))
S.append(T(18, 'tx19_city_windows_doors', 10, 5, 'city windows, doors and storefronts', CITY, ['window wall town', 'window wall', 'door wall', 'storefront wall', 'utility door wall'],
 [['brick', 'dark', 'wood', 'arch', 'shutters', 'curtains blue', 'leaded', 'blinds brick', 'frosted', 'barred prison'],
  ['lit lamp glow', 'office', 'curtains lit glow', 'rainy', 'broken ruin', 'boarded ruin', 'broken panes ruin', 'foggy', 'lattice green', 'stained glass cathedral'],
  ['door wood', 'door steel', 'door blue', 'door glass', 'door green', 'door red', 'gate iron', 'shutter roll', 'door rust double', 'door cream'],
  ['shop dark store', 'shop awning store', 'shop shutter green store', 'shop red lit glow store', 'grille security', 'shop blue store', 'shop black store', 'shop boarded ruin', 'shop curtains lit store', 'glass block'],
  ['vent louver brick', 'fan', 'window barred basement', 'shutter', 'gate chain', 'doors utility', 'hatch rust', 'doors wood double', 'garage hazard', 'door steel']]))
S.append(T(19, 'tx20_rooftops', 10, 5, 'roofs', ['city', 'roof', 'rooftop'], ['roof tiles wall', 'roof floor', 'rooftop equipment wall', 'roof edge accent', 'roof ruin floor'],
 [['terracotta village', 'slate shingles', 'fishscale tiles', 'corrugated teal', 'corrugated steel', 'corrugated rust', 'shingles dark', 'shakes wood village', 'corrugated blue', 'tiles beige'],
  ['tar', 'gravel', 'tar patched', 'concrete', 'metal seam', 'gravel moss', 'tar puddle', 'concrete light', 'felt red', 'felt green'],
  ['vent louver', 'fan', 'skylight', 'skylight pyramid', 'hatch', 'drain gravel', 'chimney brick', 'ducts', 'ac unit', 'solar panel'],
  ['parapet moss', 'coping brick', 'gutter steel', 'gutter copper', 'ridge terracotta', 'ridge slate', 'cornice', 'cornice dentil', 'flashing metal', 'fascia wood'],
  ['terracotta broken', 'slate hole', 'slate lichen', 'teal peeling', 'shingles patched', 'shingles snow', 'brick grimy', 'corrugated rust teal', 'shakes broken', 'concrete cracked']]))
S.append(T(20, 'tx21_streets', 10, 5, 'streets', CITY + ['street'], ['pavement floor', 'road floor', 'wall detail', 'fence wall', 'rubble ruin floor'],
 [['asphalt road', 'asphalt cracked road', 'concrete slabs', 'brick herringbone', 'cobblestone village', 'pavers', 'mosaic', 'sidewalk', 'concrete stained', 'asphalt pothole road'],
  ['manhole', 'drain storm', 'curb', 'road_lanes line white', 'road_lanes double yellow', 'crosswalk road_lanes', 'curb red', 'tactile paving', 'hatch utility', 'cobble gutter'],
  ['brick downpipe', 'plaster pipes', 'meters electric', 'ac unit', 'brick vent', 'cables', 'graffiti brick', 'graffiti concrete', 'fence wood', 'corrugated rust'],
  ['fence iron', 'chain link fence', 'fence green', 'balustrade', 'concrete wall moss', 'brick wall cap', 'block wall dark', 'cornice', 'corrugated steel', 'planks wood'],
  ['rubble', 'pavers weeds overgrown', 'brick rubble', 'road cracked', 'tiles broken', 'blocks moss', 'brick crumbled', 'plaster burnt', 'planks boarded', 'concrete rebar']]))
LUX = ['luxury', 'downtown', 'modern']
S.append(T(21, 'tx22_luxury_materials', 10, 5, 'luxury materials', LUX, ['marble stone floor wall', 'metal wall', 'tile floor wall', 'panel wall', 'inlay accent wall'],
 [['granite black', 'marble white heaven', 'stone beige', 'travertine', 'granite blue', 'marble green', 'sandstone', 'granite grey', 'granite pink', 'marble grey'],
  ['steel brushed', 'gold brushed', 'steel black', 'steel bricks', 'copper', 'bronze fluted', 'steel tiles', 'tiles white', 'fluted dark', 'steel ribs'],
  ['stone tiles beige', 'concrete tiles', 'fluted beige', 'subway tiles white', 'slate tiles', 'glass tiles blue', 'tiles taupe', 'terrazzo store', 'stone woodgrain', 'tiles cream store'],
  ['fluted stone', 'planks wood', 'granite tiles black', 'marble bricks', 'steel perforated', 'copper mesh', 'steel pyramids', 'steel diamond', 'copper ribs', 'steel louvers'],
  ['gold inlay', 'marble black steel', 'stone strips', 'gold grid', 'granite inlay blue', 'wood glass slit', 'marble copper inlay', 'brass lattice', 'vent louvre', 'strips dark']]))
SKY = ['skyscraper', 'glass', 'window', 'downtown', 'city']
S.append(T(22, 'tx23_skyscraper_glass', 10, 5, 'skyscraper curtain-wall glass', SKY, ['glass blue wall', 'glass grey wall', 'glass amber wall', 'structural glass wall', 'stone glass wall'],
 [['grid', 'sky', 'bands', 'mullions teal', 'clouds', 'mullions dark', 'mosaic', 'frame light', 'frame copper', 'frame white'],
  ['grey', 'overcast', 'ribs dark', 'storm', 'bands light', 'frame dark', 'bands grey', 'frit', 'green dark', 'ribs white'],
  ['amber', 'frame gold', 'clouds amber', 'bronze', 'fins copper', 'frame copper', 'gold sky', 'bands copper', 'bands beige', 'ribs copper'],
  ['x brace', 'diagrid', 'perforated', 'fins dark', 'louvers blue', 'cylinder', 'checker', 'triangles', 'blocks dark', 'gradient blue'],
  ['granite', 'stone frame', 'green steel bands', 'stone pillar', 'marble pillar', 'copper pillars', 'stone h', 'gold h', 'granite', 'steel blue']]))
S.append(T(23, 'tx24_tower_lobby', 10, 5, 'tower lobbies', LUX + ['lobby'], ['door entrance wall', 'window lobby wall', 'canopy column wall', 'utility door wall', 'detail accent wall'],
 [['doors glass', 'door revolving', 'doors dark glass', 'doorway stone', 'doorway granite', 'doors marble gold', 'door glass wall', 'doors bronze', 'atrium glass', 'elevator steel door'],
  ['lobby window lit glow', 'glass frosted', 'lobby doors plants', 'window bronze', 'window stone', 'window granite', 'glass sky', 'glass green', 'glass fluted', 'glass sky city'],
  ['canopy steel light', 'canopy bronze', 'canopy stone', 'granite black', 'fluted stone', 'column steel', 'fluted bronze', 'niche lights', 'fins white', 'fins black'],
  ['vent stone', 'vent bronze', 'vent granite', 'door steel', 'door stone', 'door black', 'mailboxes', 'intercom', 'doors steel', 'vent dark light'],
  ['strip light granite glow', 'strip light steel', 'diamond bronze', 'stripes stone', 'lattice brass glass', 'railing city', 'railing glass', 'railing planter', 'green wall plants', 'sconce stone']]))
S.append(T(24, 'tx25_skyscraper_facade_b', 10, 5, 'skyscraper facades 2', SKY, ['facade day wall', 'facade night lit glow wall', 'cladding wall', 'roof floor rooftop', 'roof equipment wall rooftop'],
 [['stripes blue white', 'fins bronze dark', 'balconies', 'diagrid', 'glass teal', 'balconies stepped', 'steel blue', 'bands green', 'beige bronze', 'stripes dark'],
  ['offices lit night', 'offices white', 'night sparse', 'offices band', 'offices teal', 'grid lit', 'blue sparse', 'bands lit', 'white bright', 'bronze lit'],
  ['ribs steel', 'perforated white', 'fins bronze', 'louvers', 'bronze perforated', 'glass blocks lit', 'diagrid dark', 'ribs white', 'glass cap blue', 'strip light granite'],
  ['concrete panel', 'gravel', 'panels dark', 'steel seam', 'steel light', 'solar', 'stone tiles', 'tiles dark', 'deck wood', 'green roof plants'],
  ['vent', 'fan', 'skylight', 'hatch', 'grate', 'parapet stone', 'parapet steel', 'pillar bronze', 'louver vent', 'railing glass sky']]))

cfg = json.load(open(C))
ids = {s['id'] for s in S}
cfg['sheets'] = [s for s in cfg['sheets'] if s['id'] not in ids]
cfg['sheets'].extend(S)
json.dump(cfg, open(C, 'w'), indent=1)
print(len(S), 'texture sheets catalogued')
