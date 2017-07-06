// Materials need special editors
// ******************************

EditorModule.showMaterialNodeInfo = function( node, inspector )
{
	var icon = "";
	if( LS.Material.icon)
		icon = "<span class='icon' style='width: 20px'><img src='" + EditorModule.icons_path + LS.Material.icon + "' class='icon'/></span>";

	var options = {};
	options.callback = function(v){
		node._material_collapsed = !v;
	}
	options.collapsed = node._material_collapsed;
	var title = "Material";
	var buttons = "<span class='buttons'><img class='options_section' src='imgs/mini-cog.png'></span>";
	var section = inspector.addSection(icon + " " + title + buttons, options);

	section.querySelector(".wsectiontitle").addEventListener("contextmenu", (function(e) { 
		if(e.button != 2) //right button
			return false;
		inner_showActions(e);
		e.preventDefault(); 
		return false;
	}).bind(this));

	inspector.current_section.querySelector('.options_section').addEventListener("click", inner_showActions );

	var mat_ref = "";
	if(node.material)
	{
		if(typeof(node.material) == "string")
			mat_ref = node.material;
		else
			mat_ref = "@Instance";
	}

	inspector.addMaterial("Ref", mat_ref, { name_width: 100, callback: function(v) {

		CORE.userAction("node_material_assigned", node, v );
		node.material = v;
		CORE.afterUserAction("node_material_assigned", node, v );

		inspector.refresh();
	}, callback_edit: function(){
		node._show_mat = true;
		inspector.refresh();
	}});

	if(!node.material)
	{
		if(!node.material && node.constructor == LS.SceneNode )
		{
			inspector.addButton(null,"Create Material", { callback: function(v) { 
				EditorModule.showAddMaterialToNode( node, function( mat ){ 
					inspector.refresh();
				});
			}});
		}
		return;
	}

	var material = node.getMaterial();

	if(!material) 
	{
		if( LS.ResourcesManager.isLoading( node.material ) )
		{
			inspector.addInfo("", "Loading...");
			LS.ResourcesManager.onceLoaded( node.material, function() { inspector.refresh(); } );
		}
		else
			inspector.addInfo("", "Material not found");
		return;
	}

	//mark material as changed
	LiteGUI.bind( section, "wchange", function(e) { 
		if(!material)
			return;
		var fullpath = material.fullpath || material.filename;
		if(!fullpath)
			return;
		LS.ResourcesManager.resourceModified( material );				
	});


	//there is a material
	var mat_type = LS.getObjectClassName( material );

	var icon = section.querySelector(".icon");
	icon.addEventListener("dragstart", function(event) { 
		event.dataTransfer.setData("uid", material.uid);
		event.dataTransfer.setData("type", "Material");
		event.dataTransfer.setData("node_uid", node.uid);
		event.dataTransfer.setData("class", mat_type );
	});

	LiteGUI.bind( inspector.current_section, "wchange", function(e) { 
		if(material.remotepath)
			LS.RM.resourceModified( material );
		CORE.userAction( "material_changed", material );
	});

	inspector.addInfo("Class", mat_type );

	if(material.remotepath)
		inspector.addButton("Reference","Save to Server",{ callback: function(){
			var material = node.getMaterial();
			DriveModule.saveResource( material, function(){
				DriveModule.onUpdatePreview(material);
			});
		}});	

	if(!node._show_mat)
	{
		inspector.addButtons(null, ["See Properties"], { skip_wchange: true, callback: function(v) { 
			if(v == "See Properties")
				node._show_mat = true;
			else
				EditorModule.inspectInDialog( material );

			inspector.refresh();
		}});
		return;
	}

	var name = LS.getObjectClassName( material );
	var mat_class = material.constructor;

	inspector.addButton(null, "Hide Editor", { skip_wchange: true, callback: function(v) { 
		node._show_mat = false;
		inspector.refresh();
	}});


	EditorModule.showMaterialProperties( material, inspector, node );


	function inner_showActions(e)
	{
		var actions = ["Paste"];
		if(material)
			actions.push("Copy","Paste","Delete","Share","Instance","Show JSON");

		var menu = new LiteGUI.ContextMenu( actions, {component: material, title: mat_type || "Material", event: e, callback: inner_menu_select });
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
				material.object_class = LS.getObjectClassName(material);
				LiteGUI.toClipboard( material.serialize() );
			}
			else
				LiteGUI.toClipboard( { type:"value", data: material } );
		}
		else if( v == "Paste")
		{
			var data = LiteGUI.getLocalClipboard();
			if(!data ) return;

			var material = data;
			if( material.type == "value" )
				material = material.data;
			else if( LS.MaterialClasses[ material.object_class ] )
			{
				material = new LS.MaterialClasses[ material.object_class ]();
				delete data["object_class"];
				material.configure(data);
				material.loadTextures();
			}
			else
				return;

			CORE.userAction("node_material_assigned", node, material );
			node.material = material;
			CORE.afterUserAction("node_material_assigned", node, material  );
			inspector.refresh();
			LS.GlobalScene.refresh();
		}
		else if( v == "Delete" )
		{
			var material = node.getMaterial();
			if(!material)
				return;
			CORE.userAction("node_material_assigned", node, null );
			node.material = null; 
			CORE.afterUserAction("node_material_assigned", node, null );
			inspector.refresh();
			LS.GlobalScene.refresh();
		}
		else if( v == "Share" )
		{
			var resource = node.material;
			var material = node.getMaterial();

			//to avoid problems when getting a material out from a prefab
			delete material.from_pack;
			delete material.from_prefab;

			//clone the material
			if( typeof(resource) == "string" )
			{
				resource = material.clone();
				delete resource.filename;
				delete resource.fullpath;
				resource.object_class = LS.getObjectClassName( resource );
			}
			else
				resource.object_class = LS.getObjectClassName( node.material );

			resource.updatePreview( DriveModule.preview_size || 256 );

			DriveModule.showResourceMaterialDialog( { material: material, callback: function( material ){
				node.material = material.fullpath || material.filename;
				inspector.refresh();
			}});
		}
		else if( v == "Clone" || v == "Instance" )
		{
			EditorModule.cloneNodeMaterial( node );
			inspector.refresh();
		}
		else if( v == "Show JSON" )
		{
			var material = node.getMaterial();
			if(material)
				EditorModule.checkJSON( material );
			inspector.refresh();
		}
		else
			LiteGUI.alert("Unknown option");
	}
}

EditorModule.registerNodeEditor( EditorModule.showMaterialNodeInfo );


EditorModule.showMaterialProperties = function( material, inspector, node, force_unlock )
{
	var mat_class = material.constructor;
	var editor = mat_class["@inspector"];

	//start container in case we want to lock it
	var editor_container = inspector.startContainer(null,{ className: "material_editor_container" });
	var background_container = inspector.startContainer(null,{ className: "background" });
	var blocker = null;

	var can_be_locked = material.fullpath;
	var is_locked = can_be_locked && !material._unlocked && !force_unlock;

	editor_container.classList.add("locked_container");

	if(is_locked)
	{
		background_container.classList.add("blur");
		background_container.classList.add("edited");
	}

	//show material editor
	if(editor)
		editor.call( EditorModule, material, inspector );
	else
	{
		inspector.addInfo( LS.getObjectClassName(material) + "has no editor");
	}

	if(can_be_locked)
		inspector.addButtons(null,["Save changes","Lock"],function(v){

			LS.ResourcesManager.resourceModified( material );				

			if(v == "Save changes")
				DriveModule.saveResource( material );
			else if(v == "Lock")
			{
				delete material._unlocked;
				inspector.refresh();
			}
		});

	inspector.endContainer(); //background
	inspector.endContainer(); //material_editor_container

	if(can_be_locked) //add locked window
	{
		editor_container.style.position = "relative";
		var blocker = LiteGUI.createElement("div",null,"<p>Shared Material</p>");
		blocker.className = "foreground";
		var unlock_button = LiteGUI.createButton(null,"Unlock Material", function(){
			material._unlocked = true;
			background_container.classList.remove("blur");
			blocker.style.display = "none";
		});
		blocker.appendChild( unlock_button );
		if(node)
		{
			var clone_button = LiteGUI.createButton(null,"Clone", function(){
				EditorModule.cloneNodeMaterial( node );
				inspector.refresh();
			});
			blocker.appendChild( clone_button );
		}
		editor_container.appendChild( blocker );

		if(!is_locked)
		{
			background_container.classList.remove("blur");
			background_container.classList.add("edited");
			blocker.style.display = "none";
		}
	}
}



LS.Material["@inspector"] = function( material, inspector )
{
	inspector.addCombo("Shader", material.shader_name || "default", { values: LS.Material.available_shaders, callback: function(v) { 
		if(!material) return;

		if(v != "default")
			material.shader_name = v; 
		else
			material.shader_name = null;
	}});

	inspector.addTitle("Properties");
	inspector.addColor("Color", material.color, { pretitle: AnimationModule.getKeyframeCode( material, "color" ), callback: function(color) { material.color.set(color); } });
	inspector.addSlider("Opacity", material.opacity, { pretitle: AnimationModule.getKeyframeCode( material, "opacity" ), min: 0, max: 1, step:0.01, callback: function (value) { 
		material.opacity = value; 
		/*
		if(material.opacity < 1 && material.blend_mode == LS.Blend.NORMAL)
			material.blend_mode = LS.Blend.ALPHA;
		if(material.opacity >= 1 && material.blend_mode == LS.Blend.ALPHA)
			material.blend_mode = LS.Blend.NORMAL;
		*/
	}});


	/*
	inspector.widgets_per_row = 2;
	inspector.addCombo("Blend mode", material.blend_mode, {  pretitle: AnimationModule.getKeyframeCode( material, "blend_mode" ), values: LS.Blend, callback: function (value) { material.blend_mode = value }});
	inspector.addCheckbox("Alpha Test", material.alpha_test, { pretitle: AnimationModule.getKeyframeCode( material, "alpha_test" ), callback: function (value) { material.alpha_test = value; } });
	inspector.widgets_per_row = 1;
	//inspector.addCheckbox("two-sided", node.flags.two_sided, { callback: function(v) { node.flags.two_sided = v; } });
	*/

	var texture_channels = material.getTextureChannels();

	if(texture_channels && texture_channels.length)
	{
		inspector.addSeparator();
		inspector.beginGroup("Textures",{title:true});
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

			inspector.addStringButton(channel, tex, { channel: channel, callback: function(filename) {
				if(!filename)
					material.setTexture(this.options["channel"], null);
				else
					material.setTexture(this.options["channel"], filename);

				LS.GlobalScene.refresh();
			},callback_button: function(filename) { 
				EditorModule.showTextureSamplerInfo( material, this.options.channel );
			}});
		}
		inspector.endGroup();
	}

	//inspector.addTitle("Actions");
	//inspector.addButtons(null,["Make Global","Copy","Paste"],{});
}

LS.MaterialClasses.StandardMaterial["@inspector"] = function( material, inspector )
{
	inspector.addTitle("Properties");
	inspector.widgets_per_row = 2;
	inspector.addSlider("Opacity", material.opacity, { pretitle: AnimationModule.getKeyframeCode( material, "opacity" ), min: 0, max: 1, step:0.01, callback: function (value) { 
		material.opacity = value; 
		if(material.opacity < 1 && material.blend_mode == LS.Blend.NORMAL)
			material.blend_mode = LS.Blend.ALPHA;
		if(material.opacity >= 1 && material.blend_mode == LS.Blend.ALPHA)
			material.blend_mode = LS.Blend.NORMAL;
	}});
	inspector.addCombo("Blend mode", material.blend_mode, { pretitle: AnimationModule.getKeyframeCode( material, "blend_mode" ), values: LS.Blend, callback: function (value) { material.blend_mode = value }});

	inspector.addButton(null, "Edit Flags", { callback: function () { LS.Material.showFlagsEditor( material ); } });
	inspector.addRenderState("Render State", material.render_state, {} );

	//inspector.addCheckbox("Alpha Test", material.alpha_test, { pretitle: AnimationModule.getKeyframeCode( material, "alpha_test" ), callback: function (value) { material.alpha_test = value; } });
	inspector.widgets_per_row = 1;

	//inspector.addCheckbox("two-sided", node.flags.two_sided, { callback: function(v) { node.flags.two_sided = v; } });
	inspector.addSeparator();
	inspector.addColor("Color", material.color, { pretitle: AnimationModule.getKeyframeCode( material, "color" ), callback: function(color) { material.color = color; } });
	inspector.addColor("Ambient", material.ambient, { pretitle: AnimationModule.getKeyframeCode( material, "ambient" ),callback: function(color) { material.ambient = color; } });
	inspector.addSlider("Backlight", material.backlight_factor, { pretitle: AnimationModule.getKeyframeCode( material, "backlight_factor" ),min: 0, step:0.01, max:1, callback: function (value) { material.backlight_factor = value; } });
	inspector.addCheckbox("Constant diffuse", material.constant_diffuse, { pretitle: AnimationModule.getKeyframeCode( material, "constant_diffuse" ), callback: function (value) { material.constant_diffuse = value; }});

	inspector.addSlider("Specular", material.specular_factor, { pretitle: AnimationModule.getKeyframeCode( material, "specular_factor" ), min: 0, step:0.01, max:2, callback: function (value) { material.specular_factor = value; } });
	inspector.addSlider("Spec. gloss", material.specular_gloss, { pretitle: AnimationModule.getKeyframeCode( material, "specular_gloss" ), min:1,max:20, callback: function (value) { material.specular_gloss = value; } });

	inspector.widgets_per_row = 2;
	inspector.addCheckbox("Spec. on top", material.specular_on_top, { pretitle: AnimationModule.getKeyframeCode( material, "specular_on_top" ), callback: function (value) { material.specular_on_top = value; }});
	inspector.addCheckbox("Spec. alpha", material.specular_on_alpha, { pretitle: AnimationModule.getKeyframeCode( material, "specular_on_alpha" ), callback: function (value) { material.specular_on_alpha = value; }});
	inspector.widgets_per_row = 1;
	inspector.addSlider("Reflection", material.reflection_factor, { pretitle: AnimationModule.getKeyframeCode( material, "reflection_factor" ), callback: function (value) { material.reflection_factor = value; } });
	inspector.addSlider("Reflection exp.", material.reflection_fresnel, { pretitle: AnimationModule.getKeyframeCode( material, "reflection_fresnel" ), min:0, max:20, callback: function (value) { material.reflection_fresnel = value; }});
	inspector.widgets_per_row = 2;
	inspector.addCheckbox("Reflec. add", material.reflection_additive, { pretitle: AnimationModule.getKeyframeCode( material, "reflection_additive" ),callback: function (value) { material.reflection_additive = value; }});
	inspector.addCheckbox("Reflec. specular", material.reflection_specular, { pretitle: AnimationModule.getKeyframeCode( material, "reflection_specular" ),callback: function (value) { material.reflection_specular = value; }});
	inspector.widgets_per_row = 1;
	inspector.addCheckbox("Reflec. gloss", material.reflection_gloss, { callback: function (value) { material.reflection_gloss = value; }});

	inspector.widgets_per_row = 1;
	inspector.addColor("Emissive", material.emissive, { pretitle: AnimationModule.getKeyframeCode( material, "emissive" ), callback: function(color) { 
		vec3.copy(material.emissive, color); 
	}});

	inspector.addSlider("Normalmap factor", material.normalmap_factor, { pretitle: AnimationModule.getKeyframeCode( material, "normalmap_factor" ), min: 0, step:0.01, max:1.5, callback: function (value) { material.normalmap_factor = value; } });

	inspector.addTitle("Velvet");
	inspector.addColor("Velvet", material.velvet, { pretitle: AnimationModule.getKeyframeCode( material, "velvet" ), callback: function(color) { vec3.copy(material.velvet,color); }});
	inspector.addSlider("Velvet exp.", material.velvet_exp, { pretitle: AnimationModule.getKeyframeCode( material, "velvet_exp" ), max:5, callback: function (value) { material.velvet_exp = value; }});
	inspector.addCheckbox("Velvet add", material.velvet_additive, { pretitle: AnimationModule.getKeyframeCode( material, "velvet_additive" ), callback: function (value) { material.velvet_additive = value; }});

	inspector.addTitle("Detail");
	inspector.addSlider("Detail", material.detail_factor, { pretitle: AnimationModule.getKeyframeCode( material, "detail_factor" ), min:-2,max:2,step:0.01, callback: function (value) { material.detail_factor = value; }});
	inspector.addVector2("Det. Tiling", material.detail_scale, { pretitle: AnimationModule.getKeyframeCode( material, "detail_scale" ), min:-40,max:40,step:0.1, callback: function (value) { material.detail_scale = value; }});

	/*
	inspector.addTitle("Extra");
	inspector.addSlider("Extra factor", material.extra_factor, { pretitle: AnimationModule.getKeyframeCode( material, "extra_factor" ), callback: function (value) { material.extra_factor = value; }});
	inspector.addColor("Extra color", material.extra_color, { pretitle: AnimationModule.getKeyframeCode( material, "extra_color" ), callback: function(color) { vec3.copy(material.extra_color,color); } });
	*/

	/*
	inspector.addTitle("Shader");
	if( material._view_shader_code )
	{
		var coding_container = inspector.addContainer( null,null, { height: 300} );
		var codepad = new CodingPadWidget();
		coding_container.appendChild( codepad.root );
		codepad.editInstanceCode( material, { id: material.uid, title: "Shader", lang:"glsl", help: material.constructor.coding_help, getCode: function(){ return material.extra_surface_shader_code; }, setCode: function(code){ material.extra_surface_shader_code = code; } } );
	}
	inspector.addButton("", !material._view_shader_code ? "Edit Shader" : "Hide Shader", { callback: function() { 
		material._view_shader_code = !material._view_shader_code;
		inspector.refresh();
		//CodingModule.openTab();
		//CodingModule.editInstanceCode( material, { id: material.uid, title: "Shader", lang:"glsl", help: material.constructor.coding_help } );
	}});
	*/

	/*
	inspector.addTitle("Shader");
	inspector.addButton(null, "Edit Shader", { callback: function() { 
		CodingModule.openTab();
		CodingModule.editInstanceCode( material, { 
			id: material.uid, 
			title: "Shader", 
			lang:"glsl", 
			help: material.constructor.coding_help, 
			getCode: function(){ return material.extra_surface_shader_code; },
			setCode: function(code){ material.extra_surface_shader_code = code; }
		});
	}});
	*/

	inspector.beginGroup("Textures",{title:true});

	var texture_channels = material.getTextureChannels();
	
	for(var i in texture_channels)
	{
		var channel = texture_channels[i];
		var sampler = material.getTextureSampler(channel);

		inspector.addTextureSampler( channel, sampler, { channel: channel, material: material, callback: function(sampler) {
			if(!sampler.texture)
				sampler = null;
			var channel = this.options ? this.options.channel : this.channel;
			if(channel)
				material.setTextureSampler( channel, sampler ); //this is the options because the callback is there
		}});
	}

	inspector.endGroup();

	//inspector.addTitle("Actions");
	//inspector.addButtons(null,["Make Global","Copy","Paste"],{});
}

if(LS.MaterialClasses.newStandardMaterial)
	LS.MaterialClasses.newStandardMaterial["@inspector"] = LS.MaterialClasses.StandardMaterial["@inspector"];


LS.Material.showFlagsEditor = function( material )
{
	var dialog = new LiteGUI.Dialog( { title:"Standard Material Flags", close: true, minimize: true, width: 260, scroll: false, draggable: true});
	var inspector = new LiteGUI.Inspector();
	for( var i in material.flags )
		inspector.addCheckbox( i, material.flags[i], { name: i, name_width: 150, callback: inner } );

	dialog.add( inspector );

	dialog.show();

	function inner(v)
	{
		material.flags[ this.options.name ] = v;
		LS.GlobalScene.requestFrame();
	}
}


//EditorModule.registerMaterialEditor("Material", EditorModule.showGlobalMaterialInfo );

//Used in SurfaceMaterial 
LS.MaterialClasses.SurfaceMaterial["@inspector"] = function( material, inspector )
{
	inspector.addTitle("Properties");
	inspector.widgets_per_row = 2;
	inspector.addSlider("Opacity", material.opacity, { pretitle: AnimationModule.getKeyframeCode( material, "opacity" ), min: 0, max: 1, step:0.01, callback: function (value) { material.opacity = value; }});
	inspector.addCombo("Blend mode", material.blend_mode, { pretitle: AnimationModule.getKeyframeCode( material, "blend_mode" ), values: LS.Blend, callback: function (value) { material.blend_mode = value }});
	inspector.widgets_per_row = 1;
	inspector.addColor("Color", material.color, { pretitle: AnimationModule.getKeyframeCode( material, "color" ), callback: function(color) { vec3.copy(material.color,color); } });

	for(var i in material.properties)
	{
		var p = material.properties[i];
		inspector.add( p.type, p.label || p.name, p.value, { pretitle: AnimationModule.getKeyframeCode( material, p.name ), title: p.name, step: p.step, property: p, callback: inner_on_property_change });
	}

	inspector.addTextureSampler("Environment", material.textures["environment"], { callback: function(v) { material.textures["environment"] = v; } });

	inspector.addButtons(null,["Add Property","Edit"], { callback: function(v) { 
		if(v == "Add Property")
			EditorModule.showAddPropertyDialog(inner_on_newproperty, ["number","vec2","vec3","vec4","color","texture","cubemap","sampler"] );
		else 
			EditorModule.showEditPropertiesDialog( material.properties, ["number","vec2","vec3","vec4","color","texture","cubemap","sampler"], inner_on_editproperties );
	}});

	inspector.addTitle("Shader & Flags");

	/* allows to edit the shader directly in the material properties
	if( material._view_shader_code )
	{
		var coding_container = inspector.addContainer( null,null, { height: 300} );
		var codepad = new CodingPadWidget();
		coding_container.appendChild( codepad.root );
		codepad.editInstanceCode( material, { id: material.uid, title: "Shader", lang:"glsl", help: material.constructor.coding_help } );
		codepad.top_widgets.addButton(null,"In Editor",{ callback: function(v) { 
			material._view_shader_code = !material._view_shader_code;
			inspector.refresh();
			CodingModule.openTab();
			CodingModule.editInstanceCode( material, { id: material.uid, title: "Shader", lang:"glsl", help: material.constructor.coding_help } );
		}});
	}

	inspector.addButton("", !material._view_shader_code ? "Edit Shader" : "Hide Shader", { callback: function() { 
		material._view_shader_code = !material._view_shader_code;
		inspector.refresh();
		//CodingModule.openTab();
		//CodingModule.editInstanceCode( material, { id: material.uid, title: "Shader", lang:"glsl", help: material.constructor.coding_help } );
	}});
	*/

	inspector.addButton("Shader", "Edit Shader", { callback: function() { 
		CodingModule.editInstanceCode( material, { id: material.uid, title: "Shader", lang:"glsl", help: material.constructor.coding_help }, true );
	}});

	inspector.addRenderState("Render State", material.render_state, {} );

	inspector.addSeparator();

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

		inspector.refresh();
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
		inspector.refresh();
		
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

LS.MaterialClasses.ShaderMaterial["@inspector"] = function( material, inspector, is_fx )
{
	inspector.addTitle("Properties");

	inspector.addShader("shader", material.shader, { pretitle: AnimationModule.getKeyframeCode( material, "shader" ), 
		callback: function(v) { 
			material.shader = v; 
			inspector.refresh();
		}, callback_refresh: function(){
			material.processShaderCode();
		}
	});

	inspector.addSeparator();

	if( !material._shader )
		return;
	
	if( !LS.RM.resources[ material._shader ] )
		inspector.addInfo(null,"Shader not loaded");
	else
	{
		if(!is_fx)
		{
			//inspector.addCombo("Blend mode", material.blend_mode, { pretitle: AnimationModule.getKeyframeCode( material, "blend_mode" ), values: LS.Blend, callback: function (value) { material.blend_mode = value }});
			inspector.addSlider("Opacity", material.opacity, { pretitle: AnimationModule.getKeyframeCode( material, "opacity" ), min: 0, max: 1, step:0.01, callback: function (value) { material.opacity = value; }});
		}
		inspector.addColor("Color", material.color, { pretitle: AnimationModule.getKeyframeCode( material, "color" ), callback: function(color) { vec3.copy(material.color,color); } });

		for(var i in material._properties )
		{
			var p = material._properties[i];
			var widget_type = p.widget || p.type;
			if(widget_type == "Sampler2D")
				widget_type = "sampler";
			inspector.add( widget_type, p.label || p.name, p.value, { pretitle: AnimationModule.getKeyframeCode( material, p.name ), title: p.name, step: p.step, precision: p.precision, values: p.values, property: p, callback: inner_on_property_change });
		}
	}

	function inner_on_property_change(v)
	{
		var p = this.options.property;
		if(!p)
			return;
		if(v && (p.type == LS.TYPES.NODE || p.type == LS.TYPES.COMPONENT) && v.constructor !== String)
			v = v.uid;
		p.value = v;
		if(p.type == "texture" || p.type == "cubemap" || p.type == "sampler")
			material.textures[ p.name ] = p.value;
	}
}


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

	var widgets = new LiteGUI.Inspector( null, { name_width: "50%" });
	widgets.onchange = function()
	{
		if(options.callback)
			options.callback( sampler );
		LS.GlobalScene.refresh();
	}

	widgets.addTexture("Texture", sampler.texture || "", { callback: function(v) {
		sampler.texture = v;
		//sampler._must_update = true;
		if(options.callback)
			options.callback( sampler );
		LS.GlobalScene.refresh();
	}});

	widgets.addSeparator();

	widgets.addCombo("UVs", sampler["uvs"] || LS.Material.DEFAULT_UVS[ channel ], { values: LS.Material.TEXTURE_COORDINATES, callback: function(v) {
		sampler.uvs = v;
		LS.GlobalScene.refresh();
	}});

	widgets.addCombo("Wrap", sampler["wrap"] || gl.REPEAT, { values: {"default":0, "CLAMP_TO_EDGE": gl.CLAMP_TO_EDGE, "REPEAT": gl.REPEAT, "MIRRORED_REPEAT": gl.MIRRORED_REPEAT }, callback: function(v) {
		sampler.wrap = v;
		//sampler._must_update = true;
		LS.GlobalScene.refresh();
	}});

	widgets.addCombo("Min filter", sampler["minFilter"] || gl.LINEAR_MIPMAP_LINEAR, { values: {"default":0, "NEAREST":gl.NEAREST, "LINEAR": gl.LINEAR, "NEAREST_MIPMAP_NEAREST": gl.NEAREST_MIPMAP_NEAREST, "NEAREST_MIPMAP_LINEAR": gl.NEAREST_MIPMAP_LINEAR, "LINEAR_MIPMAP_NEAREST": gl.LINEAR_MIPMAP_NEAREST , "LINEAR_MIPMAP_LINEAR": gl.LINEAR_MIPMAP_LINEAR }, callback: function(v) {
		sampler.minFilter = v;
		//sampler._must_update = true;
		LS.GlobalScene.refresh();
	}});

	widgets.addCombo("Mag filter", sampler["magFilter"] || gl.LINEAR, { values: {"default":0, "NEAREST":gl.NEAREST, "LINEAR": gl.LINEAR}, callback: function(v) {
		sampler.magFilter = v;
		//sampler._must_update = true;
		LS.GlobalScene.refresh();
	}});

	widgets.addCombo("Missing", sampler["missing"] || "black", { values: ["black","grey","white","normal"], callback: function(v) {
		sampler.missing = v;
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
		widgets.addVector2("Tiling", [m[0],m[4]], { step:0.001, callback: function (value) { 
			material.uvs_matrix[0] = value[0]; material.uvs_matrix[4] = value[1];
			var sampler = material.textures[ channel ];
			if(sampler)
				sampler.uvs = "transformed";
		}});
		widgets.addVector2("Offset", [m[6],m[7]], { step:0.001, callback: function (value) { 
			material.uvs_matrix[6] = value[0]; material.uvs_matrix[7] = value[1];
			var sampler = material.textures[ channel ];
			if(sampler)
				sampler.uvs = "transformed";
		}});
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