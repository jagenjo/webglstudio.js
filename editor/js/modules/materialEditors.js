// Materials need special editors
// ******************************

EditorModule.showMaterialNodeInfo = function(node, attributes)
{
	var icon = "";
	if(Material.icon) icon = "<span class='icon' style='width: 20px'><img src='"+ EditorModule.icons_path + Material.icon +"' class='icon'/></span>";
	var section = attributes.addSection(icon + " Material <span class='buttons'><img class='options_section' src='imgs/mini-cog.png'></span>");

	var mat_ref = "";
	if(node.material)
	{
		if(typeof(node.material) == "string")
			mat_ref = node.material;
		else
			mat_ref = "@Instance";
	}

	attributes.addMaterial("Ref", mat_ref, { callback: function(v) {
		node.material = v;
		EditorModule.refreshAttributes();
	}});

	if(!node.material)
	{
		if(!node.material && node.constructor == LS.SceneNode )
		{
			attributes.addButton(null,"Create Material", { callback: function(v) { 
				EditorModule.showAddMaterialToNode();
			}});
		}
		return;
	}

	var material = node.getMaterial();

	/*
	attributes.addString("Name", mat_name, { callback: function(v) {
		node.material = v;
		EditorModule.refreshAttributes();
	}});
*/

	if(!material) 
	{
		if( LS.ResourcesManager.isLoading( node.material ) )
		{
			attributes.addInfo("", "Loading...");
			LS.ResourcesManager.onceLoaded( node.material, function() { EditorModule.refreshAttributes(); } );
		}
		else
			attributes.addInfo("", "Material not found");
		return;
	}


	//there is a material
	var mat_type = LS.getObjectClassName(material);

	attributes.current_section.querySelector('.options_section').addEventListener("click", inner_show_options_menu );
	$(attributes.current_section).bind("wchange", function() { EditorModule.saveComponentUndo(material); });

	attributes.addInfo("Class", mat_type );

	/*
	if(typeof(node.material) == "string")
	{
		attributes.addButton("Convert","Instantiate", { callback: function() {
			var material = node.getMaterial();
			if(!material) return;

			node.material = material.clone();
			EditorModule.refreshAttributes();
		} });
	}
	*/

	if(material._server_info)
		attributes.addButton("Reference","Update Server",{ callback: function(){
			var material = node.getMaterial();
			DriveModule.saveResource(material);
		}});	

	if(!node._show_mat)
	{
		attributes.addButtons(null, ["Edit Material","Expand"], { callback: function(v) { 
			if(v == "Edit Material")
				EditorModule.inspectInDialog( material );
			else
				node._show_mat = true;
			EditorModule.refreshAttributes();
		}});
		return;
	}

	var name = LS.getObjectClassName(material);
	var mat_class = material.constructor;
	var editor = mat_class["@inspector"];

	attributes.addButton(null, "Hide Editor", { callback: function(v) { 
		node._show_mat = false;
		EditorModule.refreshAttributes();
	}});

	if(editor)
		editor.call(EditorModule, material, attributes);

	//attributes.addButtons(null,["Make Global","Copy","Paste"],{});	

	function inner_show_options_menu(e)
	{
		var menu = new LiteGUI.ContextualMenu(["Copy","Paste","Delete","Share","Instance"], {component: material, event: e, callback: inner_menu_select });
		e.preventDefault();
		e.stopPropagation();
		return true;
	}

	function inner_menu_select(v)
	{
		var material = node.material;
		if(v == "Copy")
		{
			if(typeof(material) == "object")
			{
				material.object_type = LS.getObjectClassName(material);
				LiteGUI.toClipboard( material.serialize() );
			}
			else
				LiteGUI.toClipboard( { type:"value", data: material } );
		}
		else if( v == "Paste")
		{
			var data = LiteGUI.getClipboard();
			if(!data ) return;

			var material = data;
			if( material.type == "value" )
				material = material.data;
			else if( LS.MaterialClasses[ material.object_type ] )
			{
				material = new window[ material.object_type ]();
				delete data["object_type"];
				material.configure(data);
				material.loadTextures();
			}
			else
				return;

			node.material = material;
			Scene.refresh();
		}
		else if( v == "Delete" )
		{
			var material = node.getMaterial();
			if(!material) return;
			
			LiteGUI.addUndoStep({ 
				data: { node: node, info: JSON.stringify( material.serialize()) }, //stringify to save some space
				callback: function(d) {
					d.node.material = new Material( JSON.parse(d.info) );
					$(d.node).trigger("changed");
					EditorModule.inspectNode(Scene.selected_node);
					Scene.refresh();
				}
			});

			node.material = null; 
			//EditorModule.showNodeInfo(node);
			EditorModule.inspectNode(node);
			Scene.refresh();
		}
		else if( v == "Share" )
		{
			var resource = node.material;

			//clone the material
			if( typeof(resource) == "string" )
			{
				var material = node.getMaterial();
				resource = material.clone();
				resource.object_type = LS.getObjectClassName( resource );
			}
			else
				resource.object_type = LS.getObjectClassName( node.material );

			resource.updatePreview( DriveModule.preview_size || 256 );

			EditorModule.showCreateResource( resource, function(name, res){
				node.material = name;			
				EditorModule.inspectNode(node);
			});
		}
		else if( v == "Clone" || v == "Instance" )
		{
			var material = node.getMaterial();
			material = material.clone();
			delete material["filename"]; //no name
			node.material = material;
			EditorModule.inspectNode( node );
		}
		else
			LiteGUI.alert("Unknown option");

	}
}

EditorModule.registerNodeEditor( EditorModule.showMaterialNodeInfo );


Material["@inspector"] = function( material, attributes )
{
	attributes.addCombo("Shader", material.shader_name || "default", { values: Material.available_shaders, callback: function(v) { 
		if(!material) return;

		if(v != "default")
			material.shader_name = v; 
		else
			material.shader_name = null;
	}});

	attributes.addTitle("Properties");
	attributes.addSlider("Opacity", material.opacity, { pretitle: AnimationModule.getKeyframeCode( material, "opacity" ), min: 0, max: 1, step:0.01, callback: function (value) { 
		material.opacity = value; 
		if(material.opacity < 1 && material.blend_mode == Blend.NORMAL)
			material.blend_mode = LS.Blend.ALPHA;
		if(material.opacity >= 1 && material.blend_mode == Blend.ALPHA)
			material.blend_mode = LS.Blend.NORMAL;
	}});
	//attributes.addCheckbox("two-sided", node.flags.two_sided, { callback: function(v) { node.flags.two_sided = v; } });
	attributes.addSeparator();
	attributes.addColor("Color", material.color, { pretitle: AnimationModule.getKeyframeCode( material, "color" ), callback: function(color) { material.color.set(color); } });
	attributes.addSlider("Specular", material.specular_factor, { pretitle: AnimationModule.getKeyframeCode( material, "specular_factor" ), min: 0, step:0.01, max:2, callback: function (value) { material.specular_factor = value; } });
	attributes.addSlider("Spec. gloss", material.specular_gloss, { pretitle: AnimationModule.getKeyframeCode( material, "specular_gloss" ), min:1,max:20, callback: function (value) { material.specular_gloss = value; } });

	attributes.addCombo("Blend mode", material.blend_mode, {  pretitle: AnimationModule.getKeyframeCode( material, "blend_mode" ), values: LS.Blend, callback: function (value) { material.blend_mode = value }});

	attributes.beginGroup("Textures",{title:true});

	var texture_channels = material.getTextureChannels();

	for(var i in texture_channels)
	{
		var channel = texture_channels[i];
		var tex = "";
		var texture_info = material.getTextureSampler(channel);
		if( texture_info )
		{
			var texture = texture_info.texture;
			if(typeof( texture ) == "string")
				tex = texture;
			else
				tex = "@Instance";
		}

		attributes.addStringButton(channel, tex, { channel: channel, callback: function(filename) {
			if(!filename)
				material.setTexture(this.options["channel"], null);
			else
				material.setTexture(this.options["channel"], filename);

			Scene.refresh();
		},callback_button: function(filename) { 
			EditorModule.showTextureSamplerInfo( material, this.options.channel );
		}});
	}

	attributes.endGroup();

	//attributes.addTitle("Actions");
	//attributes.addButtons(null,["Make Global","Copy","Paste"],{});
}

StandardMaterial["@inspector"] = function( material, attributes )
{
	attributes.addCombo("Shader", material.shader_name || "default", { values: StandardMaterial.available_shaders, callback: function(v) { 
		if(!material) return;

		if(v != "default")
			material.shader_name = v; 
		else
			material.shader_name = null;
	}});

	attributes.addTitle("Properties");
	attributes.addSlider("Opacity", material.opacity, { pretitle: AnimationModule.getKeyframeCode( material, "opacity" ), min: 0, max: 1, step:0.01, callback: function (value) { 
		material.opacity = value; 
		if(material.opacity < 1 && material.blend_mode == Blend.NORMAL)
			material.blend_mode = LS.Blend.ALPHA;
		if(material.opacity >= 1 && material.blend_mode == Blend.ALPHA)
			material.blend_mode = LS.Blend.NORMAL;
	}});
	attributes.addCombo("Blend mode", material.blend_mode, { pretitle: AnimationModule.getKeyframeCode( material, "blend_mode" ), values: LS.Blend, callback: function (value) { material.blend_mode = value }});

	//attributes.addCheckbox("two-sided", node.flags.two_sided, { callback: function(v) { node.flags.two_sided = v; } });
	attributes.addSeparator();
	attributes.addColor("Color", material.color, { pretitle: AnimationModule.getKeyframeCode( material, "color" ), callback: function(color) { material.color = color; } });
	attributes.addColor("Ambient", material.ambient, { pretitle: AnimationModule.getKeyframeCode( material, "ambient" ),callback: function(color) { material.ambient = color; } });
	attributes.addSlider("Backlight", material.backlight_factor, { pretitle: AnimationModule.getKeyframeCode( material, "backlight_factor" ),min: 0, step:0.01, max:1, callback: function (value) { material.backlight_factor = value; } });
	attributes.addCheckbox("Constant diffuse", material.constant_diffuse, { pretitle: AnimationModule.getKeyframeCode( material, "constant_diffuse" ), callback: function (value) { material.constant_diffuse = value; }});

	attributes.addSlider("Specular", material.specular_factor, { pretitle: AnimationModule.getKeyframeCode( material, "specular_factor" ), min: 0, step:0.01, max:2, callback: function (value) { material.specular_factor = value; } });
	attributes.addSlider("Spec. gloss", material.specular_gloss, { pretitle: AnimationModule.getKeyframeCode( material, "specular_gloss" ), min:1,max:20, callback: function (value) { material.specular_gloss = value; } });

	attributes.widgets_per_row = 2;
	attributes.addCheckbox("Spec. ontop", material.specular_ontop, { pretitle: AnimationModule.getKeyframeCode( material, "specular_ontop" ), callback: function (value) { material.specular_ontop = value; }});
	attributes.addCheckbox("Spec. alpha", material.specular_on_alpha, { pretitle: AnimationModule.getKeyframeCode( material, "specular_on_alpha" ), callback: function (value) { material.specular_on_alpha = value; }});
	attributes.widgets_per_row = 1;
	attributes.addSlider("Reflection", material.reflection_factor, { pretitle: AnimationModule.getKeyframeCode( material, "reflection_factor" ), callback: function (value) { material.reflection_factor = value; } });
	attributes.addSlider("Reflection exp.", material.reflection_fresnel, { pretitle: AnimationModule.getKeyframeCode( material, "reflection_fresnel" ), min:0, max:20, callback: function (value) { material.reflection_fresnel = value; }});
	attributes.widgets_per_row = 2;
	attributes.addCheckbox("Reflec. add", material.reflection_additive, { pretitle: AnimationModule.getKeyframeCode( material, "reflection_additive" ),callback: function (value) { material.reflection_additive = value; }});
	attributes.addCheckbox("Reflec. specular", material.reflection_specular, { pretitle: AnimationModule.getKeyframeCode( material, "reflection_specular" ),callback: function (value) { material.reflection_specular = value; }});
	attributes.widgets_per_row = 1;
	attributes.addCheckbox("Reflec. gloss", material.reflection_gloss, { callback: function (value) { material.reflection_gloss = value; }});

	attributes.widgets_per_row = 1;
	attributes.addColor("Emissive", material.emissive, { pretitle: AnimationModule.getKeyframeCode( material, "emissive" ), callback: function(color) { 
		vec3.copy(material.emissive, color); 
	}});

	attributes.addSlider("Normalmap factor", material.normalmap_factor, { pretitle: AnimationModule.getKeyframeCode( material, "normalmap_factor" ), min: 0, step:0.01, max:1.5, callback: function (value) { material.normalmap_factor = value; } });

	attributes.addTitle("Velvet");
	attributes.addColor("Velvet", material.velvet, { pretitle: AnimationModule.getKeyframeCode( material, "velvet" ), callback: function(color) { vec3.copy(material.velvet,color); }});
	attributes.addSlider("Velvet exp.", material.velvet_exp, { pretitle: AnimationModule.getKeyframeCode( material, "velvet_exp" ), max:5, callback: function (value) { material.velvet_exp = value; }});
	attributes.addCheckbox("Velvet add", material.velvet_additive, { pretitle: AnimationModule.getKeyframeCode( material, "velvet_additive" ), callback: function (value) { material.velvet_additive = value; }});

	attributes.addTitle("Detail");
	attributes.addSlider("Detail", material.detail_factor, { pretitle: AnimationModule.getKeyframeCode( material, "detail_factor" ), min:-2,max:2,step:0.01, callback: function (value) { material.detail_factor = value; }});
	attributes.addVector2("Det. Tiling", material.detail_scale, { pretitle: AnimationModule.getKeyframeCode( material, "detail_scale" ), min:-40,max:40,step:0.1, callback: function (value) { material.detail_scale = value; }});

	attributes.addTitle("Extra");
	attributes.addSlider("Extra factor", material.extra_factor, { pretitle: AnimationModule.getKeyframeCode( material, "extra_factor" ), callback: function (value) { material.extra_factor = value; }});
	attributes.addColor("Extra color", material.extra_color, { pretitle: AnimationModule.getKeyframeCode( material, "extra_color" ), callback: function(color) { vec3.copy(material.extra_color,color); } });

	attributes.addTitle("Shader");
	attributes.addButton(null, "Edit Shader", { callback: function() { 
		CodingModule.openTab();
		CodingModule.editInstanceCode( material, { id: material.uid, title: "Shader", lang:"glsl", help: material.constructor.coding_help, getCode: function(){ return material.extra_surface_shader_code; }, setCode: function(code){ material.extra_surface_shader_code = code; } } );
	}});

	attributes.beginGroup("Textures",{title:true});

	var texture_channels = material.getTextureChannels();
	
	for(var i in texture_channels)
	{
		var channel = texture_channels[i];
		var sampler = material.getTextureSampler(channel);

		attributes.addTextureSampler( channel, sampler, { channel: channel, material: material, callback: function(sampler) {
			if(!sampler.texture)
				sampler = null;
			material.setTextureSampler( this.channel, sampler );
		}});
	}

	attributes.endGroup();

	//attributes.addTitle("Actions");
	//attributes.addButtons(null,["Make Global","Copy","Paste"],{});
}

//EditorModule.registerMaterialEditor("Material", EditorModule.showGlobalMaterialInfo );

//Used in SurfaceMaterial and CustomMaterial
function GenericMaterialEditor( material, attributes )
{
	attributes.addTitle("Properties");
	attributes.addSlider("Opacity", material.opacity, { pretitle: AnimationModule.getKeyframeCode( material, "opacity" ), min: 0, max: 1, step:0.01, callback: function (value) { material.opacity = value; }});
	attributes.addColor("Color", material.color, { pretitle: AnimationModule.getKeyframeCode( material, "color" ), callback: function(color) { vec3.copy(material.color,color); } });
	attributes.addTextureSampler("Environment", material.textures["environment"], { callback: function(v) { material.textures["environment"] = v; } });
	attributes.addCombo("Blend mode", material.blend_mode, { pretitle: AnimationModule.getKeyframeCode( material, "blend_mode" ), values: LS.Blend, callback: function (value) { material.blend_mode = value }});

	for(var i in material.properties)
	{
		var p = material.properties[i];
		attributes.add( p.type, p.label || p.name, p.value, { pretitle: AnimationModule.getKeyframeCode( material, p.name ), title: p.name, step: p.step, property: p, callback: inner_on_property_change });
	}

	attributes.addButtons(null,["Add Property","Edit"], { callback: function(v) { 
		if(v == "Add Property")
			EditorModule.showAddPropertyDialog(inner_on_newproperty, ["number","vec2","vec3","vec4","color","texture","cubemap","sampler"] );
		else 
			EditorModule.showEditPropertiesDialog( material.properties, ["number","vec2","vec3","vec4","color","texture","cubemap","sampler"], inner_on_editproperties );
	}});

	attributes.addTitle("Shader");
	attributes.addButton("", "Edit Shader", { callback: function() { 
		CodingModule.openTab();
		CodingModule.editInstanceCode( material, { id: material.uid, title: "Shader", lang:"glsl", help: material.constructor.coding_help } );
	}});

	attributes.addTitle("Flags");
	//attributes.addCheckbox("Reflective", false );

	attributes.addSeparator();

	function inner_on_newproperty(p)
	{
		material.properties.push(p);
		if(p.type == "texture" || p.type == "cubemap")
			material.textures[p.name] = p.value;
		else if (material[ p.name ])
		{
			LiteGUI.alert("There is already a property with that name.");
			return;
		}			
		else
			material[ p.name ] = p.value;

		EditorModule.refreshAttributes();
	}

	function inner_on_editproperties(p)
	{
		if(p.type == "texture" || p.type == "cubemap")
			material.textures[ p.name ] = p.value;
		else
		{
			if( material[ p.name ] && material[ p.name ].set) 
				material[ p.name ].set( p.value );
			else
				material[ p.name ] = p.value;
		}
		EditorModule.refreshAttributes();
		
		/*
		material.properties.push(p);
		if(p.type == "texture" || p.type == "cubemap")
			material.textures[p.name] = p.value;
		EditorModule.refreshAttributes();
		*/
	}	

	function inner_on_property_change(v)
	{
		var p = this.options.property;
		p.value = v;
		if(p.type == "texture" || p.type == "cubemap")
			material.textures[p.name] = p.value;
	}

}

CustomMaterial["@inspector"] = GenericMaterialEditor;
SurfaceMaterial["@inspector"] = GenericMaterialEditor;

//shows a dialog to configure a texture sampler (channel and material is passed to add extra fields in normalmap, displacement, etc)
EditorModule.showTextureSamplerInfo = function( sampler, options )
{
	options = options || {};
	
	if(!sampler)
		sampler = {};

	var channel = options.channel || "color";
	var material = options.material;

	var dialog = new LiteGUI.Dialog("dialog_texture_sampler", {title:"Texture Sampler", close: true, minimize: true, width: 360, scroll: false, draggable: true});
	dialog.show('fade');

	var tex = "";
	if( sampler.texture )
	{
		if(typeof( sampler.texture ) == "string")
			tex =  sampler.texture;
		else
			tex = "@Instance";
	}

	var widgets = new LiteGUI.Inspector("import_widgets",{ name_width: "50%" });
	widgets.onchange = function()
	{
		if(options.callback)
			options.callback( sampler );
		LS.GlobalScene.refresh();
	}

	widgets.addTexture("Texture", sampler.texture || "", { callback: function(v) {
		sampler["texture"] = v;
		LS.GlobalScene.refresh();
	}});

	widgets.addSeparator();

	widgets.addCombo("UVs", sampler["uvs"] || Material.DEFAULT_UVS[ channel ], { values: Material.TEXTURE_COORDINATES, callback: function(v) {
		sampler["uvs"] = v;
		LS.GlobalScene.refresh();
	}});

	widgets.addCombo("Wrap", sampler["wrap"] || gl.REPEAT, { values: {"default":0, "CLAMP_TO_EDGE": gl.CLAMP_TO_EDGE, "REPEAT": gl.REPEAT, "MIRRORED_REPEAT": gl.MIRRORED_REPEAT }, callback: function(v) {
		sampler["wrap"] = v;
		LS.GlobalScene.refresh();
	}});

	widgets.addCombo("Min filter", sampler["minFilter"] || gl.LINEAR_MIPMAP_LINEAR, { values: {"default":0, "NEAREST":gl.NEAREST, "LINEAR": gl.LINEAR, "NEAREST_MIPMAP_NEAREST": gl.NEAREST_MIPMAP_NEAREST, "NEAREST_MIPMAP_LINEAR": gl.NEAREST_MIPMAP_LINEAR, "LINEAR_MIPMAP_NEAREST": gl.LINEAR_MIPMAP_NEAREST , "LINEAR_MIPMAP_LINEAR": gl.LINEAR_MIPMAP_LINEAR }, callback: function(v) {
		sampler["minFilter"] = v;
		LS.GlobalScene.refresh();
	}});

	widgets.addCombo("Mag filter", sampler["magFilter"] || gl.LINEAR, { values: {"default":0, "NEAREST":gl.NEAREST, "LINEAR": gl.LINEAR}, callback: function(v) {
		sampler["magFilter"] = v;
		LS.GlobalScene.refresh();
	}});

	if(material)
	{
		if(channel == "normal")
		{
			widgets.addCheckbox("Tangent space", material.normalmap_tangent, { callback: function (value) { material.normalmap_tangent = value; } });
			widgets.addSlider("Normal factor", material.normalmap_factor, { min:0, step:0.01, max:2, callback: function (value) { material.normalmap_factor = value; } });
		}
		else if(channel == "displacement")
		{
			widgets.addNumber("Displace factor", material.displacementmap_factor || 0, { step:0.001, callback: function (value) { material.displacementmap_factor = value; } });
		}
		else if(channel == "bump")
		{
			widgets.addSlider("Bump factor", material.bumpmap_factor || 0, { min:-2, step:0.01, max:2, callback: function (value) { material.bumpmap_factor = value; } });
		}

		widgets.addTitle("UVs transformed");
		var m = material.uvs_matrix;
		widgets.addVector2("Tiling", [m[0],m[4]], { step:0.001, callback: function (value) { material.uvs_matrix[0] = value[0]; material.uvs_matrix[4] = value[1]; }});
		widgets.addVector2("Offset", [m[6],m[7]], { step:0.001, callback: function (value) { material.uvs_matrix[6] = value[0]; material.uvs_matrix[7] = value[1]; }});
	}

	dialog.addButton( "Clear", { className: "big", callback: function(v) { 
		if(options.callback)
			options.callback( null );
	}});

	dialog.addButton( "Close", { className: "big", callback: function(v) { 
		dialog.close();
	}});


	dialog.add(widgets);
	dialog.adjustSize(30);
	//widgets.addString("Name", last_file ? last_file.name : "");
}