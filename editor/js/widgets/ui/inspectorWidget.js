function InspectorWidget( options )
{
	this.instance = null;
	this.editor = null;
	this.locked = false;
	this.prev_history = [];
	this.next_history = [];

	this.init( options );
}

InspectorWidget.MAX_HISTORY = 10;

InspectorWidget.widget_name = "Inspector";
CORE.registerWidget( InspectorWidget );

InspectorWidget.prototype.init = function( options )
{
	options = options || {};
	var that = this;

	//create area
	this.root = LiteGUI.createElement( "div", null, null, { width:"100%", height:"100%" });
	this.root.className = "inspector_widget";

	if(options.id)
		this.root.id = options.id;

	this.header = LiteGUI.createElement( "div", ".header", "<button class='litebutton prev icon' title='Previous'>&#10096;</button><span class='title'></span><button class='litebutton refresh icon' title='Refresh'>&#8635;</button><button class='litebutton lock icon' title='Lock'>&#128274;</button><button class='litebutton next icon' title='Next'>&#10097;</button>", { height: "26px" });
	this.root.appendChild( this.header );
	this.title = this.header.querySelector(".title");
	this.header.querySelector(".prev").addEventListener("click", this.onPrevious.bind(this) );
	this.header.querySelector(".next").addEventListener("click", this.onNext.bind(this) );
	this.header.querySelector(".refresh").addEventListener("click", this.onRefresh.bind(this) );
	this.header.querySelector(".lock").addEventListener("click", this.onLock.bind(this) );

	this.header.addEventListener("contextmenu", (function(e) { 
		if(e.button != 2) //right button
			return false;
		EditorModule.showInstanceContextMenu( that.instance , e );
		e.preventDefault(); 
		return false;
	}).bind(this));

	//create inspector
	this.inspector = new LiteGUI.Inspector( { height: -26, name_width: "40%" });
	this.inspector.inspector_widget = this; //double link
	this.inspector.onchange = function()
	{
		RenderModule.requestFrame();
	}
	this.inspector.addInfo(null,"select something to see its attributes");
	
	this.root.appendChild( this.inspector.root );

	this.root.addEventListener("DOMNodeInsertedIntoDocument", function(){ that.bindEvents(); });
	this.root.addEventListener("DOMNodeRemovedFromDocument", function(){  that.unbindEvents(); });
	if(this.root._parentNode)
		this.bindEvents();

	LiteGUI.createDropArea( this.root, this.onItemDrop.bind(this) );

	this.inspector.root.style.overflowX = "hidden";
}

InspectorWidget.prototype.onPrevious = function()
{
	if(!this.prev_history.length)
		return;

	var prev = this.prev_history.pop();

	if(this.instance && this.instance != prev)
	{
		this.next_history.push( this.instance );
		if(this.next_history.length > InspectorWidget.MAX_HISTORY)
			this.next_history.splice(0,1);
	}

	this.inspect( prev, true );
}

InspectorWidget.prototype.onNext = function()
{
	if(!this.next_history.length)
		return;

	var next = this.next_history.pop();

	if(this.instance  && this.instance != next)
	{
		this.prev_history.push( this.instance );
		if(this.prev_history.length > InspectorWidget.MAX_HISTORY)
			this.prev_history.splice(0,1);
	}

	this.inspect( next, true );
}

InspectorWidget.prototype.onRefresh = function(e)
{
	this.inspector.refresh();
}


InspectorWidget.prototype.onLock = function(e)
{
	this.locked = !this.locked;
	if(this.locked)
		e.target.classList.add("active");
	else
		e.target.classList.remove("active");
}

InspectorWidget.prototype.onItemDrop = function(e)
{
	var uid = e.dataTransfer.getData("uid");
	var class_type = e.dataTransfer.getData("class");
	var res_fullpath = e.dataTransfer.getData("res-fullpath");
	var res_type = e.dataTransfer.getData("res-type");

	var instance = null;
	var that = this;

	if(res_fullpath)
	{
		instance = LS.ResourcesManager.resources[ res_fullpath ];

		if(this.instance && this.instance.constructor === LS.SceneNode)
		{
			var compo = null;
			var ext = LS.RM.getExtension( res_fullpath );

			switch( res_type )
			{
				case "Script": compo = new LS.Components.ScriptFromFile({ filename: res_fullpath }); break;
				case "Mesh": compo = new LS.Components.MeshRenderer({ mesh: res_fullpath }); break;
				case "Prefab": this.instance.prefab = res_fullpath; this.inspector.refresh(); break;
			}

			if(compo)
			{
				this.instance.addComponent(compo);
				if(instance)
					LS.ResourcesManager.load( res_fullpath );
				this.inspector.refresh();
				return;
			}

		}
		//if(instance && instance.constructor.is_material )
		//	class_type = "Material";
	}

	if(class_type)
	{
		switch(class_type)
		{
			case "SceneNode": instance = LS.GlobalScene.getNode( uid ); break;
			case "Material": instance = LS.ResourcesManager.getMaterial( uid ); break;
			default: 
				if( LS.Components[class_type] )
					instance = LS.GlobalScene.findComponentByUId( uid );
				else if( LS.MaterialClasses[class_type] )
					instance = LS.ResourcesManager.getMaterial( uid );
			break;
		}
	}
	else
	{
		console.log("No uid found on dropped item");
	}

	if(!instance)
		return;
	this.inspect( instance );

}

InspectorWidget.prototype.setTitle = function( v )
{
	this.title.innerHTML = v;
}

//clears the inspector and inspects the given object
InspectorWidget.prototype.inspect = function( object, skip_history, title )
{
	if(this.locked)
		return;

	if(!skip_history && this.instance && this.instance != this.prev_history[ this.prev_history.length - 1 ] )
	{
		this.prev_history.push( this.instance );
		if(this.prev_history.length > InspectorWidget.MAX_HISTORY)
			this.prev_history.splice(0,1);
		this.next_history.length = 0; //reset next with new stuff
	}

	this.instance = object;

	var that = this;

	this.inspector.on_refresh = function(){
		that.inspect( object, true );
	};

	if( !object )
		this.clear();
	else if(object.constructor == String || object.constructor == Number || object.constructor == Boolean ) //basic types?
		return;
	else if( object.inspect )
	{
		this.inspector.clear();
		object.inspect( this.inspector );
	}
	else if( object.constructor.inspect )
	{
		this.inspector.clear();
		object.constructor.inspect( object, this.inspector );
	}
	else if( object.constructor == LS.Scene )
		this.inspectScene( object );
	else if( object.constructor == LS.SceneNode )
		this.inspectNode( object );
	else if( object.constructor.is_material )
		this.inspectMaterial( object );
	else if( object.constructor == Array )
		this.inspectObjectsArray( object );
	else 
		this.inspectObject( object );

	var title_code = "";
	if(object)
	{
		var class_name = title|| object.className || LS.getObjectClassName(object);
		title_code = "<span class='classname'>" + class_name + "</span> <span class='name'>" + (object.name || "") + "</span>";
	}
	this.setTitle( title_code );
}

InspectorWidget.prototype.clear = function()
{
	this.inspector.clear();
	this.inspector.instance = null;
	this.inspector.on_refresh = null;
}

InspectorWidget.prototype.update = function( object )
{
	if(!this.instance)
		return;
	if(object && object != this.instance)
		return;
	this.inspector.updateWidgets();
}

InspectorWidget.prototype.inspectObject = function( object )
{
	this.inspectObjectsArray( [ object ], this.inspector );
	this.inspector.instance = object;
}

InspectorWidget.prototype.inspectObjectsArray = function( objects_array, inspector )
{
	inspector = inspector || this.inspector;
	inspector.instance = objects_array;

	inspector.on_refresh = (function()
	{
		inspector.clear();
		for(var i = 0; i < objects_array.length; i++)
		{
			var object = objects_array[i];
			if(!object)
				continue;

			this.showObjectInterface( object );
		}
	}).bind(this);

	inspector.refresh();
}

InspectorWidget.prototype.showObjectInterface = function( object, inspector )
{
	inspector = inspector || this.inspector;

	//check type of object
	if( LS.isClassComponent( object.constructor ) )
		this.inspector.showComponent( object, inspector );
	else
		this.inspector.showObjectFields( object, inspector );
}

//inspects all the components in one container
InspectorWidget.prototype.showComponentsInterface = function( object, inspector )
{
	if(!object.getComponents)
		return;

	//component editors
	var components = object.getComponents();
	for(var i in components)
	{
		var component = components[i];

		if( component.constructor === LS.MissingComponent )
		{
			var name = component._comp_class;
			var title = "<span class='title'>"+name+" <span style='color:#FAA'>(missing)</span></span>";
			var buttons = " <span class='buttons'></span>";
			var section = inspector.addSection( title + buttons );
			section.classList.add("error");
			inspector.widgets_per_row = 2;
			inspector.addStringButton( "Component class", name, { name_width: 120, width: "90%", comp_class: name, button_width: 80, button:"Convert", callback_button: function(v){
				CORE.userAction( "node_changed", object );
				LS.replaceComponentClass( LS.GlobalScene, this.options.comp_class, v );
				inspector.refresh();
			}});
			inspector.addButton(null,"<img src='imgs/mini-icon-trash.png'/>",{ component: component, width: "10%", callback: function(){
				CORE.userAction( "node_changed", object );
				object.removeComponent( this.options.component );
				inspector.refresh();
			}});
			inspector.widgets_per_row = 1;
			continue;
		}

		this.inspector.showComponent( component, inspector );
	}

	//missing components are components which class is not found in the system, we keep them in case the class will be loaded afterwards
}

//special cases
InspectorWidget.prototype.inspectScene = function( scene )
{
	var that = this;
	var inspector = this.inspector;
	inspector.instance = scene;

	if(!scene)
	{
		inspector.clear();
		inspector.on_refresh = null;
		return;
	}

	inspector.on_refresh = function()
	{
		inspector.clear();
		inspector.addTitle("Info");
		inspector.addString("Fullname", scene.extra.fullname || "", { name_width: 120 });
		inspector.addFolder("Data folder", scene.extra.data_folder || "", { name_width: 120, callback: function(v) { scene.extra.data_folder = v; }});

		inspector.addTitle("Metadata");
		inspector.addString("Author", scene.extra.author || "", { name_width: 120, callback: function(v) { scene.extra.author = v; }});
		inspector.addSeparator();
		if( window.PlayModule )
		inspector.addStringButton("Test URL", scene.extra.test_url || "", { name_width: 120, button: "&#9658;", callback: function(v) { scene.extra.test_url = v; }, callback_button: function(){
			PlayModule.launch();
		}});
		inspector.addSeparator();

		inspector.addTitle("External Scripts");
		for(var i in scene.external_scripts)
		{			
			inspector.addStringButton(null, scene.external_scripts[i], { index: i, callback: function(v){
					if(!v)
						return;
					scene.external_scripts[this.options.index] = v;
				}, callback_button: function(){
					//delete imported
					scene.external_scripts.splice(this.options.index,1);
					inspector.refresh();
				},
				button: "<img src='imgs/mini-icon-trash.png'/>"
			});
		}
		inspector.addStringButton(null, "", { callback: function(v){
			}, callback_button: function(v){
				if(!v)
					return;
				//add script
				scene.external_scripts.push(v);
				LS.GlobalScene.loadScripts( null, null, function(){
					LiteGUI.alert("Error loading script");
					//scene.external_scripts.pop(); //why remove it? 
					inspector.refresh();
				});
				inspector.refresh();
			},
			button: "+"
		});

		inspector.widgets_per_row = 2;
		inspector.addButton(null,"Reload scripts", { width: "60%", callback: function(){
			LS.GlobalScene.loadScripts( null, null, LiteGUI.alert, true );
		}});

		inspector.addButton(null,"Add from Repository",{ width: "40%", callback: function(){
			PluginsModule.showOficialScriptsDialog();
		}});
		inspector.widgets_per_row = 1;

		inspector.addTitle("Global Scripts");
		inspector.widgets_per_row = 2;
		for(var i in scene.global_scripts)
		{	
			inspector.addScript(null, scene.global_scripts[i], { width: "100% - 60px", index: i, callback: function(v){
					if(!v)
					{
						scene.global_scripts.splice(this.options.index,1);
						inspector.refresh();
						return;
					}
					scene.global_scripts[this.options.index] = v;
				}
			});
			inspector.addButton(null, "<img src='imgs/mini-icon-trash.png'/>", { width: 30, index: i, callback: function(){
				var r = confirm("Do you want to remove the script from the list?");
				if(!r)
					return;
				scene.global_scripts.splice( this.options.index, 1 );
				inspector.refresh();
			}});
		}
		inspector.widgets_per_row = 1;

		inspector.addScript(null, "", { callback: function(v){
				if(!v || v.indexOf(".js") == -1)
					return;
				//add script
				scene.global_scripts.push(v);
				LS.GlobalScene.loadScripts( null, null, function(){
					LiteGUI.alert("Error loading script");
					scene.global_scripts.pop();
					inspector.refresh();
				});
				inspector.refresh();
			}});

		if(scene.global_scripts && scene.global_scripts.length)
			inspector.addButton(null,"Reload scripts", function(){
				LS.GlobalScene.loadScripts( null, function(){
					NotifyModule.show("Scripts reloaded");
					EditorModule.refreshAttributes();
				}, function(err, url){
					 LiteGUI.alert("Error loading scripts, not found: " + url );
				},true);
			});

		/*
		inspector.addTitle("Global Scripts");
		inspector.addArray(null,scene.global_scripts, { data_type:"resource", callback: function(v){
			console.log(v);
		}});
		*/

		inspector.addTitle("Preloaded Resources");
		var container = inspector.startContainer(null,{height:100});
		container.style.backgroundColor = "#252525";
		for(var i in scene.preloaded_resources)
		{			
			inspector.addStringButton(null, i, { callback: function(v){
					var old = this.getValue();
					if(old == v)
						return;
					delete scene.preloaded_resources[old];
					scene.preloaded_resources[v] = true;
					inspector.refresh();
				}, callback_button: function(){
					delete scene.preloaded_resources[ this.getValue() ];
					inspector.refresh();
				},
				button: "<img src='imgs/mini-icon-trash.png'/>"
			});
		}
		inspector.endContainer();
		inspector.addResource( null, "", { allow_multiple: true, callback: function(v){
			if(!v)
				return;
			//add resource
			scene.preloaded_resources[v] = true;
			inspector.refresh();
		}});

		inspector.addSeparator();
		inspector.addTitle("Texture Atlas");
		inspector.widgets_per_row = 2;
		inspector.addCheckbox("Use atlas", !!scene.texture_atlas, function(v){ if(!v) scene.texture_atlas = null; });
		inspector.addButton(null,"Generate", function(){ TextureTools.generateTextureAtlas(); });
		inspector.widgets_per_row = 1;

		inspector.addSeparator();
		inspector.addButton(null,"Show Root Node", function(){
			that.inspect(LS.GlobalScene.root);
		});
	}

	inspector.refresh();
}


InspectorWidget.prototype.inspectNode = function( node, component_to_focus )
{
	var inspector = this.inspector;
	inspector.instance = node;

	if(!node)
	{
		inspector.clear();
		inspector.on_refresh = null;
		return;
	}

	inspector.on_refresh = (function()
	{
		inspector.clear();
		if(node == LS.GlobalScene.root) //main node use an special editor
		{
			this.showSceneRootInfo(node, inspector);
		}
		else
		{
			if(typeof(node) == "undefined" || node == null) {
				return;
			}

			inspector.widgets_per_row = 2;
			inspector.addString("name", node._name || "", { name_width: 80, callback: function(v) {
				if(!v)
					return node._name;
				var old_name = node.name;
				if( !node.setName(v) )
					return node._name;
				CORE.userAction( "node_renamed", node, old_name );
			}});

			var uid_widget = inspector.addString("UId", node.uid, { name_width: 40, disabled: true });
			//uid_widget.addEventListener("click", function( e ){ this.querySelector("input").select(); }); //dont work

			inspector.widgets_per_row = 1;

			var inside_prefab = false;

			if(node.prefab)
			{
				inspector.widgets_per_row = 2;
				inspector.addStringButton("prefab", node.prefab, { width: -30, name_width: 80, callback: function(v){
					node.prefab = v;
					inspector.refresh();
				},callback_button: function(v,evt) {
					EditorModule.showSelectResource( { type:"Prefab", on_complete: function(v){
						node.prefab = v;
						inspector.refresh();
					}});
				}});

				inspector.addButton( null, LiteGUI.special_codes.navicon, { height: "1em", width: 30, callback: function(v,evt){
					var menu = new LiteGUI.ContextMenu( ["Show Prefab Info","Choose Prefab","Reload from Prefab","Update to Prefab",null,"Unlink prefab"], { title:"Prefab Menu", event: evt, callback: function(action) {
						if(action == "Show Prefab Info")
						{
							var res = LS.ResourcesManager.getResource( node.prefab );
							if(res)
								PackTools.showPackDialog( res );
						}
						else if(action == "Choose Prefab")
						{
							EditorModule.showSelectResource( { type:"Prefab", on_complete: function(v){
								CORE.userAction("node_changed",node);
								node.prefab = v;
								inspector.refresh();
							}});
						}
						else if(action == "Unlink prefab")
						{
							//add prefab to resources otherwise all the info will be lost
							var prefab_fullpath = node.prefab;
							CORE.userAction("node_changed",node);
							var prefab = LS.RM.resources[ node.prefab ];
							if( prefab && prefab.containsResources() )
							{
								var prefab_fullpath = node.prefab;
								LiteGUI.confirm("Add prefab to the preload resources of the scene?", function(v){
									if(v)
										node.scene.preloaded_resources[ prefab_fullpath ] = true;
								});
							}
							node.prefab = null;
							inspector.refresh();
							InterfaceModule.scene_tree.refresh();
						}
						else if(action == "Reload from Prefab")
						{
							CORE.userAction("node_changed",node);
							node.reloadFromPrefab();
							inspector.refresh();
						}
						else if(action == "Update to Prefab")
						{
							PackTools.updatePrefabFromNode(node);
							inspector.refresh();
							RenderModule.requestFrame();
						}
					}});
				}});
				inspector.widgets_per_row = 1;
			}
			else if(node.insidePrefab())
			{
				inside_prefab = true;
				var prefab_node = node.insidePrefab();
				inspector.root.classList.add("prefab-child");
				inspector.widgets_per_row = 2;
				inspector.addString("From Prefab", prefab_node.prefab, { name_width: 80, disabled: true, width: "75%" } );
				inspector.addButton(null,"Go to Node", { width: "25%", callback: function(){
					SelectionModule.setSelection( prefab_node );
				}});
				inspector.widgets_per_row = 1;
			}

			inspector.widgets_per_row = 2;

			inspector.addLayers("layers", node.layers, { name_width: 80, pretitle: AnimationModule.getKeyframeCode( node, "layers"), callback: function(v) {
				node.layers = v;
				RenderModule.requestFrame();
			}});
			inspector.addString("class", node.className, { name_width: 80, callback: function(v) { node.className = v; } });

			inspector.widgets_per_row = 1;

			if(node !== LS.GlobalScene.root)
			{
				inspector.widgets_per_row = 2;
				inspector.addCheckbox("visible", node.visible, { name_width: 80, pretitle: AnimationModule.getKeyframeCode( node, "visible"), callback: function(v) { node.visible = v; } });
				inspector.addCheckbox("is_static", node.is_static, { name_width: 80, callback: function(v) { node.is_static = v; } });
				inspector.widgets_per_row = 1;
			}

			if(inside_prefab)
				inspector.addInfo(null,"This node belongs to a prefab, any changes made won't be saved with the scene.");

			//Special node editors ****************************************
			//like Materials mostly
			for(var i in EditorModule.node_editors)
				EditorModule.node_editors[i](node, inspector);
		}

		//components
		this.showComponentsInterface( node,inspector );

		//flags
		inspector.addSection("Extras", { collapsed: true }); //node._editor.collapsed
		if(node.flags)
		{
			inspector.addTitle("Flags");
			inspector.widgets_per_row = 2;
			inspector.addFlags( node.flags, { visible: true, is_static: false, selectable: true, locked: false }, { name_width: "75%" } );
			inspector.widgets_per_row = 1;
			inspector.addString("Custom flags","", { callback: function(v){
				node.flags[v] = true;	
				inspector.refresh();
			}});
		}

		inspector.addSection();

		//final buttons
		inspector.widgets_per_row = 2;

		inspector.addButton(null,"Add component", { callback: function(v) { 
			EditorModule.showAddComponentToNode( node, function(){
				inspector.refresh();
			});
		}});

		inspector.addButtons(null,["Add Behaviour"], { callback: function(v,evt) { 

			var menu = new LiteGUI.ContextMenu( ["Inner Script","Script From File","Global Script","Inner Graph","Graph From File"], { event: evt, callback: function(action) {
				if(action == "Inner Script")
					CodingModule.onNewScript( node );
				else if(action == "Script From File")
					CodingModule.onNewScript( node, "ScriptFromFile" );
				else if(action == "Global Script")
					CodingModule.onNewScript( node, "Global" );
				else if(action == "Inner Graph")
					GraphModule.onNewGraph( node );
				else if(action == "Graph From File")
					GraphModule.onNewGraph( node, true );
				inspector.refresh();
			}});
		}});

		inspector.widgets_per_row = 1;

		if(component_to_focus)
			inspector.scrollTo( component_to_focus.uid.substr(1) );
		AnimationModule.attachKeyframesBehaviour( inspector );
	}).bind(this);

	inspector.refresh();
}

InspectorWidget.prototype.inspectMaterial = function(material)
{
	this.inspector.clear();

	var icon = "";
	if( LS.Material.icon)
		icon = "<span class='icon' style='width: 20px'><img src='" + EditorModule.icons_path + LS.Material.icon + "' class='icon'/></span>";

	var title = "Material";
	var buttons = "<span class='buttons'><img class='options_section' src='imgs/mini-cog.png'></span>";
	var section = this.inspector.addSection(icon + " " + title + buttons );

	section.querySelector(".wsectiontitle").addEventListener("contextmenu", (function(e) { 
		if(e.button != 2) //right button
			return false;
		//inner_showActions(e);
		e.preventDefault(); 
		return false;
	}).bind(this));

	//inspector.current_section.querySelector('.options_section').addEventListener("click", inner_showActions );

	//mark material as changed
	LiteGUI.bind( section, "wchange", function() { 
		if(!material)
			return;
		var fullpath = material.fullpath || material.filename;
		if(!fullpath)
			return;
		LS.ResourcesManager.resourceModified( material );				
	});

	EditorModule.showMaterialProperties( material, this.inspector );
}

InspectorWidget.prototype.showSceneRootInfo = function( scene )
{
	var that = this;
	this.inspector.addButton("Scene Settings","Show Scene Settings", function(){
		that.inspect( LS.GlobalScene );
	});
}


InspectorWidget.prototype.bindEvents = function()
{

}

InspectorWidget.prototype.unbindEvents = function()
{

}

InspectorWidget.createDialog = function( parent )
{
	var dialog = new LiteGUI.Dialog( null, { title:"Inspector", fullcontent: true, closable: true, draggable: true, minimize: true, resizable: true, parent: parent, width: 500, height: 500 });
	var widget = new InspectorWidget();
	dialog.add( widget );
	dialog.widget = widget;
	dialog.on_close = function()
	{
	}
	dialog.show();
	return dialog;
}


// ADD STUFF TO LiteGUI.Inspector *******************************************
LiteGUI.Inspector.prototype.showObjectFields = function( object, inspector )
{
	inspector = inspector || this;

	inspector.on_addProperty = inner;

	inspector.inspectInstance( object, null,null, ["enabled","object_class"] );

	inspector.on_addProperty = null;

	//used to hook the keyframe thing on automatic generated inspectors
	function inner( widget, object, property, value, options )
	{
		options.pretitle = AnimationModule.getKeyframeCode( object, property, options );
	}
}

//add to the LiteGUI.Inspector

LiteGUI.Inspector.prototype.showComponentTitle = function(component, inspector)
{

}

//displays a component info (title, options button, etc)
LiteGUI.Inspector.prototype.showComponent = function(component, inspector)
{
	if(!component)
		return;

	var inspector = inspector || this;

	var node = component._root;

	var component_class = component.constructor;

	//Get Component Name for titlebar
	var name = LS.getObjectClassName(component);
	if( component.getComponentTitle )
	{
		var compo_name = component.getComponentTitle();
		if(compo_name)
			name = compo_name + " <span style='opacity: 0.5'>[" + name + "]</span>";
	}

	//Create the title of the component
	var extra_code = "";
	if( component.getExtraTitleCode ) //used for script mostly
		extra_code = component.getExtraTitleCode();

	var enabler = component.enabled !== undefined ? AnimationModule.getKeyframeCode(component,"enabled") + "<span class='enabler'></span>" : "";
	var is_selected = SelectionModule.isSelected( component );
	var options = {};
	if(is_selected)
		options.className = "selected";
	var title = "<span class='title'>"+name+"</span>";
	var buttons = " <span class='buttons'><img class='options_section' src='imgs/mini-cog.png'></span>";

	if(component.uid)
		options.id = component.uid.substr(1);

	//show the component collapsed and remember it
	options.callback = function(v){
		if(!component._editor)
			component._editor = {};
		component._editor.collapsed = !v;
	}
	options.collapsed = component._editor ? component._editor.collapsed : false;

	//create component section in inspector
	var section = inspector.addSection( extra_code + enabler + title + buttons, options );

	var icon = EditorModule.getComponentIconHTML( component );
	if(section.sectiontitle)
		section.sectiontitle.insertBefore( icon, section.sectiontitle.firstChild );

	//right click in title launches the context menu
	section.querySelector(".wsectiontitle").addEventListener("contextmenu", (function(e) { 
		if(e.button != 2) //right button
			return false;
		inner_showActions(e);
		e.preventDefault(); 
		return false;
	}).bind(this));

	//checkbox for enable/disable component
	if(component.enabled !== undefined)
	{
		enabler = section.querySelector('.enabler');
		var checkbox = new LiteGUI.Checkbox( component.enabled, function(v,old){ 
			LiteGUI.trigger( section, "wbeforechange", v );
			component.enabled = v; 
			LiteGUI.trigger( section, "wchange", old );
			RenderModule.requestFrame();
		});
		checkbox.root.title ="Enable / Disable";
		enabler.appendChild( checkbox.root );
	}

	//save UNDO when something changes TODO remove this 
	LiteGUI.bind( section, "wbeforechange", function(e) { 
		CORE.userAction("component_changed", component );
	});

	LiteGUI.bind( section, "wchange", function(e) { 
		CORE.afterUserAction("component_changed", component );
	});

	//it has special editor
	if( component_class.inspect )
		component_class.inspect( component, inspector, section );
	else if (component.inspect)
		component.inspect( inspector, section );
	else if( component_class["@inspector"] ) //deprecated
		component_class["@inspector"].call( this, component, inspector, section );
	else
		this.showObjectFields( component, inspector );

	//in case the options button is pressed or the right button, show context menu
	section.querySelector('.options_section').addEventListener("click", inner_showActions );

	function inner_showActions( e ) { 
		//console.log("Show options");
		window.SELECTED = component; //useful trick
		EditorModule.showComponentContextMenu( component, e );
		e.preventDefault();
		e.stopPropagation();
	}

	var drag_counter = 0; //hack because HTML5 sux sometimes

	//drop component
	section.addEventListener("dragover", function(e) { 
		e.preventDefault();
	});
	section.addEventListener("dragenter", function(e) { 
		drag_counter++;
		if( event.dataTransfer.types.indexOf("type") != -1 && drag_counter == 1 )
		{
			this.style.opacity = "0.8";
		}
		e.preventDefault();
	},true);
	section.addEventListener("dragleave", function(e) { 
		drag_counter--;
		if(drag_counter == 0)
			this.style.opacity = null;
		e.preventDefault();
	},true);
	section.addEventListener("drop", function(event) { 
		console.log("drop");
		event.preventDefault();
		this.style.opacity = null;
		var item_uid = event.dataTransfer.getData("uid");
		var item_type = event.dataTransfer.getData("type");
		if( item_type == "Component" )
		{
			var dragged_component = LS.GlobalScene.findComponentByUId( item_uid );
			if( component != dragged_component && component.root == dragged_component.root )
			{
				console.log("Rearranging components");
				var index = dragged_component.root.getIndexOfComponent( dragged_component );
				if(index != -1)
					component.root.setComponentIndex( dragged_component, index - 1 );
				else
					console.error("component not found when rearranging");
				EditorModule.refreshAttributes();
			}
			event.stopPropagation();
			event.stopImmediatePropagation();
		}
	});

}
