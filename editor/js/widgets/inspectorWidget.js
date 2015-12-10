function InspectorWidget()
{
	this.instance = null;
	this.editor = null;
	this.locked = false;
	this.prev_history = [];
	this.next_history = [];

	this.init();
}

InspectorWidget.MAX_HISTORY = 10;

InspectorWidget.prototype.init = function()
{
	var that = this;
	
	//create area
	this.root = LiteGUI.createElement( "div", null, null, { width:"100%", height:"100%" });
	this.root.className = "inspector_widget";

	this.header = LiteGUI.createElement( "div", ".header", "<button class='prev' title='Previous'>&#10096;</button><span class='title'></span><button class='lock' title='Lock'>&#128274;</button><button class='next' title='Next'>&#10097;</button>", { height: "26px" });
	this.root.appendChild( this.header );
	this.title = this.header.querySelector(".title");
	this.header.querySelector(".prev").addEventListener("click", this.onPrevious.bind(this) );
	this.header.querySelector(".next").addEventListener("click", this.onNext.bind(this) );
	this.header.querySelector(".lock").addEventListener("click", this.onLock.bind(this) );

	this.header.addEventListener("contextmenu", (function(e) { 
		if(e.button != 2) //right button
			return false;
		EditorModule.showContextualMenu( that.instance , e );
		e.preventDefault(); 
		return false;
	}).bind(this));

	//create inspector
	this.inspector = new LiteGUI.Inspector( null,{ height: -26, name_width: "40%" });
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

InspectorWidget.prototype.onLock = function(e)
{
	this.locked = !this.locked;
	if(this.locked)
		e.target.classList.add("active");
	else
		e.target.classList.remove("active");
}


InspectorWidget.prototype.setTitle = function( v )
{
	this.title.innerHTML = v;
}

//clears the inspector and inspects the given object
InspectorWidget.prototype.inspect = function( object, skip_history )
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

	if( !object )
		this.clear();
	else if( object.inspect )
	{
		this.inspector.clear();
		object.inspect( this.inspector );
	}
	else if( object.constructor == LS.SceneTree )
		this.inspectScene( object );
	else if( object.constructor == LS.SceneNode )
		this.inspectNode( object );
	else if( object.constructor == Array )
		this.inspectObjectsArray( object );
	else 
		this.inspectObject( object );

	var title = "";
	if(object)
		title = (object.className || LS.getObjectClassName(object)) + " : " + (object.name || "");
	this.setTitle( title );
}

InspectorWidget.prototype.clear = function()
{
	this.inspector.clear();
	this.inspector.instance = null;
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
	this.inspectObjectsArray( [ object ], inspector );
	this.inspector.instance = object;
}

InspectorWidget.prototype.inspectObjectsArray = function( objects_array )
{
	var inspector = this.inspector;
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
		this.inspector.showComponent( component, inspector );
	}
}

//special cases
InspectorWidget.prototype.inspectScene = function( scene )
{
	inspector = this.inspector;
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
		inspector.addString("Title", scene.extra.title || "", function(v) { scene.extra.title = v; });
		inspector.addString("Author", scene.extra.author || "", function(v) { scene.extra.author = v; });
		inspector.addTextarea("Comments", scene.extra.comments || "", { callback: function(v) { scene.extra.comments = v; } });
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
				LS.GlobalScene.loadExternalScripts( v, null, function(){
					LiteGUI.alert("Error loading script");
					scene.external_scripts.pop();
					inspector.refresh();
				});
				inspector.refresh();
			},
			button: "+"
		});
		if(scene.external_scripts && scene.external_scripts.length)
			inspector.addButton(null,"Reload scripts", function(){
				LS.GlobalScene.loadExternalScripts( scene.external_scripts, null, LiteGUI.alert );
			});
	}

	inspector.refresh();
}


InspectorWidget.prototype.inspectNode = function( node, component_to_focus )
{
	inspector = this.inspector;
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

			if(node._name !== null)
				inspector.addString("name", node._name, { callback: function(v) {
					if(!v)
						return node._name;
					var old_name = node.name;
					if( !node.setName(v) )
						return node._name;
					UndoModule.saveNodeRenamedUndo( node, old_name );
				}});

			inspector.addString("UId", node.uid, { disabled: true });

			if(node.className != null)
				inspector.addString("class", node.className, { callback: function(v) { node.className = v; } });
			if(node.prefab)
				inspector.addStringButton("prefab", node.prefab, { callback_button: function(v,evt) {
					var menu = new LiteGUI.ContextualMenu( ["Unlink prefab"], { event: evt, callback: function(action) {
						delete node["prefab"];
						inspector.refresh();
					}});
				}});

			inspector.addLayers("layers", node.layers, { pretitle: AnimationModule.getKeyframeCode( node, "layers"), callback: function(v) {
				node.layers = v;
				RenderModule.requestFrame();
			}});
			if(node.flags && node.flags.visible != null)
				inspector.addCheckbox("visible", node.visible, { pretitle: AnimationModule.getKeyframeCode( node, "visible"), callback: function(v) { node.visible = v; } });

			//Special node editors ****************************************
			//like Materials mostly
			for(var i in EditorModule.node_editors)
				EditorModule.node_editors[i](node, inspector);
		}

		//components
		this.showComponentsInterface( node,inspector );

		//flags
		inspector.addSection("Extras", { collapsed: true });
		if(node.flags)
		{
			inspector.addTitle("Flags");
			inspector.widgets_per_row = 2;
			inspector.addFlags( node.flags, {seen_by_camera:true, seen_by_reflections:true, depth_test: true, depth_write: true, ignore_lights: false, ignore_fog: false, selectable: true} );
			inspector.widgets_per_row = 1;
		}

		inspector.addSection();

		//final buttons
		inspector.addButton(null,"Add component", { callback: function(v) { 
			EditorModule.showAddComponentToNode( node, function(){
				inspector.refresh();
			});
		}});

		inspector.addButtons(null,["Add Script","Add Graph"], { callback: function(v) { 
			if(v == "Add Script")
			{
				CodingModule.onNewScript( node );
				inspector.refresh();
			}
			else if(v == "Add Graph")
				GraphModule.onNewGraph( node );
			//inspector.refresh();
		}});

		if(component_to_focus)
			inspector.scrollTo( component_to_focus.uid.substr(1) );
		AnimationModule.attachKeyframesBehaviour( inspector );
	}).bind(this);

	inspector.refresh();
}

InspectorWidget.prototype.showSceneRootInfo = function( scene )
{
	//nothing
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
	return dialog;
}


// ADD STUFF TO LiteGUI.Inspector *******************************************
LiteGUI.Inspector.prototype.showObjectFields = function( object, inspector )
{
	inspector = inspector || this;

	inspector.on_addProperty = inner;

	inspector.inspectInstance( object, null,null, ["enabled"] );

	inspector.on_addProperty = null;

	//used to hook the keyframe thing on automatic generated inspectors
	function inner( widget, object, property, value, options )
	{
		options.pretitle = AnimationModule.getKeyframeCode( object, property, options );
	}
}

LiteGUI.Inspector.prototype.showComponent = function(component, inspector)
{
	if(!component)
		return;

	var inspector = inspector || this;

	var node = component._root;

	var component_class = component.constructor;
	var name = LS.getObjectClassName(component);

	//Create the title of the component
	if(!LiteGUI.missing_icons)
		LiteGUI.missing_icons = {};
	var icon_url = "imgs/mini-icon-question.png";
	if(component.constructor.icon && !LiteGUI.missing_icons[ component.constructor.icon ] )	
		icon_url = component.constructor.icon;

	var icon_code = "<span class='icon' style='width: 20px' draggable='true'><img src='"+ EditorModule.icons_path + icon_url+"'/></span>";
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
		component._collapsed = !v;
	}
	options.collapsed = component._collapsed;

	//create component section in inspector
	var section = inspector.addSection( icon_code + enabler + title + buttons, options );

	var icon = section.querySelector(".icon");
	icon.addEventListener("dragstart", function(event) { 
		event.dataTransfer.setData("uid", component.uid);
		event.dataTransfer.setData("type", "Component");
		event.dataTransfer.setData("node_uid", component.root.uid);
		event.dataTransfer.setData("class", LS.getObjectClassName(component));
	});


	var icon_img = section.querySelector(".icon img");
	if(icon_img)
		icon_img.onerror = function() { 
			LiteGUI.missing_icons[ component.constructor.icon ] = true;
			this.src = "imgs/mini-icon-question.png";
		}

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
		enabler = inspector.current_section.querySelector('.enabler');
		var checkbox = new LiteGUI.Checkbox( component.enabled, function(v){ 
			component.enabled = v; 
			$(inspector.current_section).trigger("wchange");
			RenderModule.requestFrame();
		});
		checkbox.root.title ="Enable / Disable";
		enabler.appendChild( checkbox.root );
	}

	//save UNDO when something changes
	$(inspector.current_section).bind("wchange", function() { 
		UndoModule.saveComponentChangeUndo( component );
	});

	//used to avoid collapsing section when clicking button
	/*
	inspector.current_section.querySelector('.options_section').addEventListener("click", function(e) { 
		e.preventDefault();
		e.stopPropagation();
		return true;
	});
	*/

	//it has special editor
	if( component_class.inspect )
		component_class.inspect( component, inspector, section );
	else if (component.inspect)
		component.inspect( inspector, section );
	else if( component_class["@inspector"] )
		component_class["@inspector"].call( this, component, inspector, section );
	else
		this.showObjectFields( component, inspector );

	//in case the options button is pressed or the right button, show contextual menu
	inspector.current_section.querySelector('.options_section').addEventListener("click", inner_showActions );

	function inner_showActions( e ) { 
		//console.log("Show options");
		window.SELECTED = component; //useful trick
		EditorModule.showComponentContextualMenu( component, e );
		e.preventDefault();
		e.stopPropagation();
	}		

	var drag_counter = 0; //hack because HTML5 sux sometimes

	//drop component
	inspector.current_section.addEventListener("dragover", function(e) { 
		e.preventDefault();
	});
	inspector.current_section.addEventListener("dragenter", function(e) { 
		drag_counter++;
		if( event.dataTransfer.types.indexOf("type") != -1 && drag_counter == 1 )
		{
			this.style.opacity = "0.5";
		}
		e.preventDefault();
	},true);
	inspector.current_section.addEventListener("dragleave", function(e) { 
		drag_counter--;
		if(drag_counter == 0)
			this.style.opacity = null;
		e.preventDefault();
	},true);
	inspector.current_section.addEventListener("drop", function(event) { 
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
		}
	});
}
