# Components in WebGLStudio

LiteScene, the engine used by WebGLStudio, is a component based engine.

That means that any action performed by the system, like rendering on the screen, adding lights, applying postprocessing effects, 
or executing scripts, comes from one of the many components.

Components are attached to the nodes in the scene to extend the properties of every node, this way the system is very modular and easy to extend.

Although the system comes with many components sometimes you need special features and you don't want to rely in inline Scripts
because they are heavier that regular components and they are not as easy to add as default components.
In that case you can create your own components and add them to the pool of components.

# Creating a new Component class

Creating a component is easy, which just a few lines of code you will have your component ready to use,
the complex part is ensure that this component is going to interact propertly with the system, here is a list of common 
steps that you will have to fulfill to create a component:

* Create the component class and register it in the system
* Add the configure and serialize methods in case you want to perform special actions when storing/restoring the state
* Add the onAddedToScene and onRemovedFromScene methods to hook the appropiate events with the system
* Define the widgets of the interface for the editor, or in the last resort, define the full interface of the component.
* Be sure that any project that uses this component is including the script as an external script.

Keep in mind that to create new components you cannot use the editor itself, because they are external files that need to be included in the library.
So you will need to have access to  your own server and store the file there to be included in the system.

## The component class

Lets start by creating a javascript file with a very basic component class.

```javascript
function MyComponent( o )
{
    this.myvar = 1;
    
    if(o)
    this.configure(o);
}
```

As you can see the component will receive an object as a parameter, this is in case we want the object to restore a previous state,
when thats the case the object will contain all the serialized data. For now we just pass that object to the configure method.


## Registering the component

The next step is to register the component in the system to it can be listed in the components list.

```javascript
LS.registerComponent( MyComponent );
```

This function is not only registering the component but also adding the mandatory methods to the component that you didn't fill (like serialize, configure).

## Testing your component in the editor

The problem with our component is that is stored in a javascript file that our editor doesnt load, so there are different ways to force the editor to load new files.
In our case what we are going to do is add the file the external scripts in the Scene settings, to do so go to Scene - Settings and add the URL of the file in the external scripts.
Once the file is loaded you will see your component when clicking the [add Component] button in any node.
If you add the component to a node you also will see that the system has detected that your component has a local variable ( this.myvar )
and has created a tiny interface so you can modify its value.

## Adding behaviour 

We have our component but its not doing anything special so we need to add some behaviour.
The best way to add behaviour to a component is binding some functions to specific events triggered by the system (like the render, mouseMove or update events).

When we want to bind an action there are several ways but the most common one is:

```javascript
  LEvent.bind( scene, "update", this.onUpdate, this );
```

Where the first parameter is the instance that will trigger the event, the second the name of the event, the thirth the callback and
the fourth parameter is the instance where you want to execute the callback. You could use mycallback.bind( this ) and skip the fourth parameter
but the problem with that approach is that you wont be able to unbind the event in the future.

If we want to unbind the event we could call unbind for every event or directly unbindAll to the specific instance:

```javascript
  LEvent.unbindAll( scene, this );
```

When binding events there is an important restriction: **you have to be sure that once this node is no longer attached to the scene (because the node 
has been removed) your component is no longer doing any action.**.

So when attaching events the best way to do it is using the **onAddedToScene** method in your component:

```javascript
MyComponent.prototype.onAddedToScene = function( scene )
{
  LEvent.bind( scene, "update", this.onUpdate, this );
}
```

And for the opposite, create the method **onRemovedFromScene**:

```javascript
MyComponent.prototype.onRemovedFromScene = function( scene )
{
  LEvent.unbind( scene, "update", this.onUpdate, this );
}
```

If your actions are more related to the node then use the onAddedToNode and onRemovedFromNode.


